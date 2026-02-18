import { env } from "@/lib/env";

export function isTrustedAuthRequest(request: Request) {
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

  const requestOrigin = safeOrigin(request.url);
  if (requestOrigin && origin === requestOrigin) return true;

  const appOrigin = safeOrigin(env.appUrl);
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
