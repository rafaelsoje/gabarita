import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PlanReferenceFilesManager } from "@/components/plan-reference-files-manager";
import { prisma } from "@/lib/prisma";
import { deletePlanFile, planFileContentUrl } from "@/lib/storage/plan-files";

type PageProps = {
  params: Promise<{ planId: string }>;
};

function formatSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileTypeLabel(name: string, mimeType: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "PDF";
  if (lower.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "DOCX";
  if (
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".ods") ||
    lower.endsWith(".csv") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel")
  ) {
    return "PLANILHA";
  }
  if (mimeType.startsWith("image/")) return "IMAGEM";
  return "ARQUIVO";
}

export default async function PlanFilesPage({ params }: PageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const { planId } = await params;

  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId, isArchived: false },
    select: {
      id: true,
      title: true,
      _count: {
        select: {
          referenceFiles: true
        }
      }
    }
  });

  if (!plan) redirect("/disciplinas");
  const currentPlan = plan;

  async function deleteReferenceFile(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const fileIdRaw = formData.get("fileId");
    const fileId = typeof fileIdRaw === "string" ? fileIdRaw : "";
    if (!fileId) return;

    const file = await prisma.planReferenceFile.findFirst({
      where: {
        id: fileId,
        plan: { id: currentPlan.id, userId: currentUserId, isArchived: false }
      },
      select: {
        id: true,
        fileName: true
      }
    });

    if (!file) return;

    await prisma.planReferenceFile.delete({ where: { id: file.id } });
    await deletePlanFile(currentUserId, file.fileName);

    revalidatePath(`/planos/${currentPlan.id}/arquivos`);
    revalidatePath(`/disciplinas?planId=${currentPlan.id}`);
    revalidatePath("/?tab=planos");
  }

  const files = await prisma.planReferenceFile.findMany({
    where: { planId: currentPlan.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true
    }
  });

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1 className="planHeaderTitle">Arquivos do plano</h1>
          <p>
            Plano: <strong>{currentPlan.title}</strong>
          </p>
        </div>
        <Link className="secondaryBtn" href={`/disciplinas?planId=${currentPlan.id}`}>
          Voltar para Disciplinas
        </Link>
      </section>

      <section className="dashboardCard">
        <div className="planReferencesManagerRow">
          <PlanReferenceFilesManager planId={currentPlan.id} initialCount={currentPlan._count.referenceFiles} />
        </div>
      </section>

      <section className="dashboardCard">
        <h3>Documentos cadastrados</h3>
        {files.length === 0 ? (
          <p className="emptyState">Nenhum arquivo cadastrado para este plano.</p>
        ) : (
          <div className="subscriptionTableWrap planFilesTableWrap">
            <table className="subscriptionTable planFilesTable">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Tipo</th>
                  <th>Tamanho</th>
                  <th>Enviado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td className="planFilesNameCell">{file.originalName}</td>
                    <td>{getFileTypeLabel(file.originalName, file.mimeType)}</td>
                    <td>{formatSize(file.sizeBytes)}</td>
                    <td>{new Date(file.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="planFilesActionsCell">
                      <div className="libraryRowActions">
                        <a className="libraryActionBtn" href={planFileContentUrl(file.id)} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                        <a className="libraryActionBtn" href={planFileContentUrl(file.id, true)}>
                          Download
                        </a>
                        <form>
                          <input type="hidden" name="fileId" value={file.id} />
                          <ConfirmSubmitButton
                            className="topicLinksRemove"
                            label="Excluir"
                            confirmTitle="Excluir arquivo"
                            confirmMessage={`Deseja realmente excluir "${file.originalName}"?`}
                            confirmActionLabel="Excluir"
                            formAction={deleteReferenceFile}
                          />
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
