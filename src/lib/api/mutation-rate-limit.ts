import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import {
  getMutationRateLimitConfig,
  type MutationRateLimitScope
} from "@/lib/api/mutation-rate-limit-config";

type Params = {
  request: Request;
  userId: string;
  scope: MutationRateLimitScope;
  maxRequests?: number;
  windowMs?: number;
};

export async function enforceMutationRateLimit(params: Params) {
  const {
    request,
    userId,
    scope,
    maxRequests,
    windowMs
  } = params;
  const defaults = getMutationRateLimitConfig(scope);
  const limitMaxRequests = maxRequests ?? defaults.maxRequests;
  const limitWindowMs = windowMs ?? defaults.windowMs;
  const ip = getClientIp(request);
  const rate = await checkRateLimit(
    `mutation:${scope}:user:${userId}:ip:${ip}`,
    limitMaxRequests,
    limitWindowMs
  );

  if (!rate.allowed) {
    return NextResponse.json(
      { message: "Muitas ações em pouco tempo. Tente novamente em 1 minuto." },
      { status: 429 }
    );
  }

  return null;
}
