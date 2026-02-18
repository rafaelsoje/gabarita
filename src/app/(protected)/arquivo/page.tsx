import Image from "next/image";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

function formatDate(value: Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

export default async function ArchivePage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  async function restorePlan(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const planIdRaw = formData.get("planId");
    const planId = typeof planIdRaw === "string" ? planIdRaw : "";
    if (!planId) return;

    const plan = await prisma.plan.findFirst({
      where: { id: planId, userId: currentUserId, isArchived: true },
      select: { id: true }
    });
    if (!plan) return;

    await prisma.plan.update({
      where: { id: plan.id },
      data: { isArchived: false, archivedAt: null }
    });

    revalidatePath("/");
    revalidatePath("/disciplinas");
    revalidatePath("/edital");
    revalidatePath("/planejamento");
    revalidatePath("/historico");
    revalidatePath("/revisoes");
    revalidatePath("/biblioteca");
    revalidatePath("/arquivo");
    redirect("/arquivo?toast=plan_restored");
  }

  const archivedPlans = await prisma.plan.findMany({
    where: { userId, isArchived: true },
    orderBy: [{ archivedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      imageUrl: true,
      archivedAt: true,
      examDate: true,
      _count: {
        select: {
          subjects: true,
          studySessions: true
        }
      }
    }
  });

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Arquivo</h1>
          <p>Planos inativos ficam aqui. Você pode reativá-los quando quiser.</p>
        </div>
      </section>

      <section className="dashboardCard">
        {archivedPlans.length === 0 ? (
          <p className="emptyState">Nenhum plano arquivado.</p>
        ) : (
          <div className="archivePlansGrid">
            {archivedPlans.map((plan) => (
              <article key={plan.id} className="archivePlanCard">
                <div className="archivePlanMedia">
                  {plan.imageUrl ? (
                    <Image
                      className="archivePlanThumb"
                      src={plan.imageUrl}
                      alt={`Imagem do plano ${plan.title}`}
                      width={88}
                      height={88}
                    />
                  ) : (
                    <div className="archivePlanThumb archivePlanThumbPlaceholder">
                      {(plan.title || "PL")
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join("") || "PL"}
                    </div>
                  )}
                </div>

                <div className="archivePlanBody">
                  <h3>{plan.title}</h3>
                  <p>Arquivado em: {formatDate(plan.archivedAt)}</p>
                  <p>Prova: {formatDate(plan.examDate)}</p>
                  <p>
                    Disciplinas: {plan._count.subjects} | Sessões: {plan._count.studySessions}
                  </p>
                </div>

                <form action={restorePlan}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <ConfirmSubmitButton
                    className="planOpenLink"
                    label="Reativar plano"
                    confirmTitle="Reativar plano"
                    confirmMessage="Deseja reativar este plano e torná-lo disponível novamente?"
                    confirmActionLabel="Reativar"
                    ariaLabel="Reativar plano"
                    title="Reativar plano"
                  />
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
