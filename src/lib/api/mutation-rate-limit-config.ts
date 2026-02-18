export type MutationRateLimitScope =
  | "plans:create"
  | "plans:update"
  | "plans:delete"
  | "plans:cycle:update"
  | "subjects:create"
  | "subjects:update"
  | "subjects:delete"
  | "topics:create"
  | "topics:update"
  | "topics:delete"
  | "plan-links:create"
  | "plan-links:delete"
  | "plan-files:upload"
  | "plan-files:delete"
  | "topic-files:upload"
  | "topic-files:delete"
  | "study-sessions:create"
  | "study-sessions:update"
  | "study-sessions:delete"
  | "questions:generate"
  | "discursive:review"
  | "notifications:dispatch";

const DEFAULT_WINDOW_MS = 60_000;

const BASE_LIMITS: Record<MutationRateLimitScope, number> = {
  "plans:create": 20,
  "plans:update": 40,
  "plans:delete": 20,
  "plans:cycle:update": 30,
  "subjects:create": 30,
  "subjects:update": 50,
  "subjects:delete": 20,
  "topics:create": 40,
  "topics:update": 60,
  "topics:delete": 30,
  "plan-links:create": 60,
  "plan-links:delete": 80,
  "plan-files:upload": 15,
  "plan-files:delete": 40,
  "topic-files:upload": 15,
  "topic-files:delete": 40,
  "study-sessions:create": 80,
  "study-sessions:update": 100,
  "study-sessions:delete": 60,
  "questions:generate": 15,
  "discursive:review": 12,
  "notifications:dispatch": 6
};

export function getMutationRateLimitConfig(scope: MutationRateLimitScope) {
  const base = BASE_LIMITS[scope] ?? 60;
  const multiplier = resolveMultiplier();
  const maxRequests = Math.max(1, Math.floor(base * multiplier));
  return {
    maxRequests,
    windowMs: DEFAULT_WINDOW_MS
  };
}

function resolveMultiplier() {
  const raw = process.env.MUTATION_RATE_LIMIT_MULTIPLIER;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return process.env.NODE_ENV === "production" ? 1 : 2;
}
