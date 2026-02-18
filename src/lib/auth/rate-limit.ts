import { prisma } from "@/lib/prisma";

type Bucket = {
  count: number;
  expiresAt: number;
};

const buckets = new Map<string, Bucket>();

type RateLimitDriver = "auto" | "memory" | "postgres" | "upstash";

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const hasUpstashConfig = Boolean(upstashUrl && upstashToken);
const configuredDriver = normalizeDriver(process.env.RATE_LIMIT_DRIVER);
const rateLimitDriver = resolveDriver(configuredDriver);
const trustProxy = process.env.TRUST_PROXY?.trim().toLowerCase() === "true";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
};

type RateLimitOptions = {
  failClosed?: boolean;
};

export async function checkRateLimit(
  key: string,
  maxRequests = 6,
  windowMs = 60_000,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const failClosed = options.failClosed === true;

  if (rateLimitDriver === "upstash") {
    try {
      return await checkRateLimitUpstash(key, maxRequests, windowMs);
    } catch {
      if (failClosed) {
        return { allowed: false, remaining: 0 };
      }
      // Fallback local if distributed store is unavailable.
      return checkRateLimitMemory(key, maxRequests, windowMs);
    }
  }

  if (rateLimitDriver === "postgres") {
    try {
      return await checkRateLimitPostgres(key, maxRequests, windowMs);
    } catch {
      if (failClosed) {
        return { allowed: false, remaining: 0 };
      }
      // Fallback local if distributed store is unavailable.
      return checkRateLimitMemory(key, maxRequests, windowMs);
    }
  }

  return checkRateLimitMemory(key, maxRequests, windowMs);
}

function checkRateLimitMemory(
  key: string,
  maxRequests = 6,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  pruneExpiredBuckets(now);
  const bucket = buckets.get(key);

  if (!bucket || bucket.expiresAt < now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (bucket.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: maxRequests - bucket.count };
}

async function checkRateLimitUpstash(
  key: string,
  maxRequests = 6,
  windowMs = 60_000
): Promise<RateLimitResult> {
  if (!hasUpstashConfig) {
    throw new Error("Upstash is not configured");
  }

  const baseUrl = upstashUrl as string;
  const token = upstashToken as string;
  const encodedKey = encodeURIComponent(key);
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  const incrResponse = await fetch(`${baseUrl}/incr/${encodedKey}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!incrResponse.ok) {
    throw new Error("Upstash INCR failed");
  }

  const incrJson = (await incrResponse.json()) as { result?: number };
  const count = Number(incrJson.result ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("Invalid Upstash INCR result");
  }

  if (count === 1) {
    const expireResponse = await fetch(
      `${baseUrl}/expire/${encodedKey}/${ttlSeconds}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      }
    );
    if (!expireResponse.ok) {
      throw new Error("Upstash EXPIRE failed");
    }
  }

  if (count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: Math.max(0, maxRequests - count) };
}

async function checkRateLimitPostgres(
  key: string,
  maxRequests = 6,
  windowMs = 60_000
): Promise<RateLimitResult> {
  const nextExpiresAt = new Date(Date.now() + windowMs);
  const result = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt", "updatedAt", "createdAt")
    VALUES (${key}, 1, ${nextExpiresAt}, NOW(), NOW())
    ON CONFLICT ("key") DO UPDATE
    SET
      "count" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "expiresAt" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= NOW() THEN ${nextExpiresAt}
        ELSE "RateLimitBucket"."expiresAt"
      END,
      "updatedAt" = NOW()
    RETURNING "count"
  `;

  const count = Number(result[0]?.count ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("Invalid Postgres rate-limit result");
  }

  maybePruneExpiredPostgresBuckets();

  if (count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: Math.max(0, maxRequests - count) };
}

function maybePruneExpiredPostgresBuckets() {
  if (Math.random() > 0.02) return;
  void prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
}

function pruneExpiredBuckets(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, value] of buckets.entries()) {
    if (value.expiresAt < now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: Request) {
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded
        .split(",")
        .map((part) => normalizeIpCandidate(part))
        .find(Boolean);
      if (first) return first;
    }

    const realIp = normalizeIpCandidate(request.headers.get("x-real-ip"));
    if (realIp) return realIp;
  }

  return "local";
}

function normalizeIpCandidate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // Handles values like "1.2.3.4:5678", "[2001:db8::1]:443" and plain IPs.
  const bracketMatch = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketMatch?.[1]) return bracketMatch[1];

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(raw)) {
    return raw.split(":")[0] ?? "";
  }

  return raw;
}

function normalizeDriver(value: string | undefined): RateLimitDriver {
  const candidate = value?.trim().toLowerCase() as RateLimitDriver | undefined;
  if (
    candidate === "memory" ||
    candidate === "postgres" ||
    candidate === "upstash" ||
    candidate === "auto"
  ) {
    return candidate;
  }
  return "auto";
}

function resolveDriver(driver: RateLimitDriver): Exclude<RateLimitDriver, "auto"> {
  if (driver === "memory" || driver === "postgres" || driver === "upstash") {
    return driver;
  }

  if (hasUpstashConfig) return "upstash";
  return "postgres";
}
