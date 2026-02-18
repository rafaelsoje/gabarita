import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { notFound, serverError, unauthorized } from "@/lib/api/http";
import { enforceMutationRateLimit } from "@/lib/api/mutation-rate-limit";

type Params = { params: Promise<{ linkId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorized();
    const limitResponse = await enforceMutationRateLimit({
      request,
      userId,
      scope: "plan-links:delete"
    });
    if (limitResponse) return limitResponse;

    const { linkId } = await params;

    const link = await prisma.planReferenceLink.findFirst({
      where: {
        id: linkId,
        plan: { userId, isArchived: false }
      },
      select: { id: true }
    });

    if (!link) return notFound();

    await prisma.planReferenceLink.delete({ where: { id: link.id } });
    return NextResponse.json({ message: "Link removido." });
  } catch {
    return serverError();
  }
}
