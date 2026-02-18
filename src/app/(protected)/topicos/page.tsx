import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export default async function TopicsRedirectPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect("/entrar");
  }

  const firstSubject = await prisma.subject.findFirst({
    where: { plan: { userId, isArchived: false } },
    select: { id: true },
    orderBy: { createdAt: "asc" }
  });

  if (!firstSubject) {
    redirect("/disciplinas");
  }

  redirect(`/disciplinas/${firstSubject.id}`);
}
