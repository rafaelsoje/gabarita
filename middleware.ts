import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const accessSecret = process.env.JWT_ACCESS_SECRET ?? "";
const isProduction = process.env.NODE_ENV === "production";
const appUrl = process.env.APP_URL ?? "";

async function hasValidAccessToken(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;
    if (!accessToken || !accessSecret) return false;
    await jwtVerify(accessToken, new TextEncoder().encode(accessSecret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPage =
    pathname === "/entrar" ||
    pathname === "/cadastro" ||
    pathname === "/esqueci-senha" ||
    pathname === "/redefinir-senha";
  const isApiRoute = pathname.startsWith("/api/");
  const isApiMutation =
    isApiRoute &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  const isProtected = isProtectedRoute(pathname);
  const authenticated = await hasValidAccessToken(request);

  if (pathname.startsWith("/uploads/topic-files/") || pathname.startsWith("/uploads/plan-files/")) {
    const response = new NextResponse("Not Found", { status: 404 });
    applySecurityHeaders(response);
    return response;
  }

  if (isApiMutation && !isTrustedApiMutationRequest(request)) {
    const response = NextResponse.json({ message: "Origem inválida." }, { status: 403 });
    applySecurityHeaders(response);
    return response;
  }

  if (isProtected && !authenticated) {
    const response = NextResponse.redirect(new URL("/entrar", request.url));
    applySecurityHeaders(response);
    return response;
  }

  if (isAuthPage && authenticated) {
    const response = NextResponse.redirect(new URL("/", request.url));
    applySecurityHeaders(response);
    return response;
  }

  const response = NextResponse.next();
  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    // Apply security headers to all app/API routes except Next internals/static files.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
  ]
};

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  const scriptSources = isProduction
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests"
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  if (isProduction) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
}

function isTrustedApiMutationRequest(request: NextRequest) {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (
    secFetchSite &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "same-site" &&
    secFetchSite !== "none"
  ) {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return false;

  if (origin === request.nextUrl.origin) return true;
  const appOrigin = safeOrigin(appUrl);
  if (appOrigin && origin === appOrigin) return true;

  return false;
}

function safeOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isProtectedRoute(pathname: string) {
  if (pathname === "/") return true;

  const protectedPrefixes = [
    "/arquivo",
    "/edital",
    "/historico",
    "/biblioteca",
    "/planejamento",
    "/planos",
    "/perfil",
    "/revisoes",
    "/disciplinas",
    "/assinatura",
    "/topicos",
    "/questoes",
    "/discursiva",
    "/simulados",
    "/estatisticas",
    "/preferencias"
  ];

  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
