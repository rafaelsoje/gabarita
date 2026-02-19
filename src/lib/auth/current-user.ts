import { cookies } from "next/headers";
import { compareToken } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";

export async function getAuthenticatedUserId() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  if (accessToken) {
    const accessPayload = await verifyAccessToken(accessToken);
    if (accessPayload?.sub) return accessPayload.sub;
  }

  const refreshToken = cookieStore.get("refresh_token")?.value;
  if (!refreshToken) return null;

  const refreshPayload = await verifyRefreshToken(refreshToken);
  if (!refreshPayload?.sub) return null;

  const activeTokens = await prisma.refreshToken.findMany({
    where: {
      userId: refreshPayload.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: {
      tokenHash: true
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  for (const token of activeTokens) {
    const isMatch = await compareToken(refreshToken, token.tokenHash);
    if (isMatch) return refreshPayload.sub;
  }

  return null;
}
