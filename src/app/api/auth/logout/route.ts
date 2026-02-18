import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearAuthCookies } from "@/lib/auth/cookies";
import { isTrustedAuthRequest } from "@/lib/auth/csrf";
import { compareToken } from "@/lib/auth/password";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  try {
    if (!isTrustedAuthRequest(request)) {
      return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
    }

    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refresh_token")?.value;

    if (refreshToken) {
      const payload = await verifyRefreshToken(refreshToken);
      if (payload?.sub) {
        const activeTokens = await prisma.refreshToken.findMany({
          where: { userId: payload.sub, revokedAt: null },
          orderBy: { createdAt: "desc" }
        });

        for (const token of activeTokens) {
          const isMatch = await compareToken(refreshToken, token.tokenHash);
          if (isMatch) {
            await prisma.refreshToken.update({
              where: { id: token.id },
              data: { revokedAt: new Date() }
            });
            break;
          }
        }
      }
    }

    const response = NextResponse.redirect(new URL("/entrar", env.appUrl));
    clearAuthCookies(response);
    return response;
  } catch {
    const response = NextResponse.json({ message: "Erro interno." }, { status: 500 });
    clearAuthCookies(response);
    return response;
  }
}
