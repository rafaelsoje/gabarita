import type { NextResponse } from "next/server";

const isProduction = process.env.NODE_ENV === "production";

export function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  response.cookies.set("access_token", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15
  });

  response.cookies.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set("access_token", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  response.cookies.set("refresh_token", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}
