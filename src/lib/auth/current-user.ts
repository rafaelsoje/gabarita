import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/jwt";

export async function getAuthenticatedUserId() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;

  if (!accessToken) return null;

  const payload = await verifyAccessToken(accessToken);
  if (!payload?.sub) return null;

  return payload.sub;
}
