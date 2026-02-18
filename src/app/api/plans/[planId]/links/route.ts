import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";

type Params = { params: Promise<{ planId: string }> };

function sanitizeLabel(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "Link de referência";
  return normalized.slice(0, 140);
}

function sanitizeUrl(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

async function ensurePlanOwnership(planId: string, userId: string) {
  return prisma.plan.findFirst({
    where: { id: planId, userId, isArchived: false },
    select: { id: true }
  });
}

export async function GET(_: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();

    const { planId } = await params;
    const plan = await ensurePlanOwnership(planId, userId);
    if (!plan) return notFound();

    const links = await prisma.planReferenceLink.findMany({
      where: { planId },
      orderBy: [{ createdAt: "desc" }]
    });

    return NextResponse.json({ links });
  } catch {
    return serverError();
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "plan-links:create"
    });
    if (limitResponse) return limitResponse;

    const { planId } = await params;
    const plan = await ensurePlanOwnership(planId, userId);
    if (!plan) return notFound();

    const payload = (await request.json().catch(() => null)) as { label?: string; url?: string } | null;
    const label = sanitizeLabel(payload?.label);
    const url = sanitizeUrl(payload?.url);
    if (!url) return badRequest("Informe uma URL válida (http:// ou https://).");

    const link = await prisma.planReferenceLink.create({
      data: {
        planId,
        label,
        url
      }
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch {
    return serverError();
  }
}
