import Image from "next/image";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { attachmentContentUrl, deleteTopicFile } from "@/lib/storage/topic-files";

type LibraryPageProps = {
  searchParams: Promise<{ planId?: string; subjectId?: string; fileType?: string; q?: string; view?: string; page?: string }>;
};

type FileTypeFilter = "all" | "pdf" | "docx" | "planilha" | "imagem";
type LibraryViewMode = "list" | "grid";
const PAGE_SIZE = 20;

const FILE_TYPE_OPTIONS: Array<{ value: FileTypeFilter; label: string }> = [
  { value: "all", label: "Todos os tipos" },
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "DOCX" },
  { value: "planilha", label: "Planilha" },
  { value: "imagem", label: "Imagem" }
];

function parseFileType(value: string | undefined): FileTypeFilter {
  if (!value) return "all";
  return FILE_TYPE_OPTIONS.some((item) => item.value === value) ? (value as FileTypeFilter) : "all";
}

function parseViewMode(value: string | undefined): LibraryViewMode {
  if (value === "grid") return "grid";
  return "list";
}

function parsePage(value: string | undefined) {
  if (!value) return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

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

function getPreviewKind(name: string, mimeType: string): "pdf" | "image" | "none" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  return "none";
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const selectedPlanId = typeof params.planId === "string" ? params.planId : "";
  const selectedSubjectId = typeof params.subjectId === "string" ? params.subjectId : "";
  const selectedFileType = parseFileType(typeof params.fileType === "string" ? params.fileType : undefined);
  const selectedViewMode = parseViewMode(typeof params.view === "string" ? params.view : undefined);
  const queryText = typeof params.q === "string" ? params.q.trim() : "";
  const requestedPage = parsePage(typeof params.page === "string" ? params.page : undefined);

  const plans = await prisma.plan.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true }
  });

  const validPlanId = plans.some((plan) => plan.id === selectedPlanId) ? selectedPlanId : "";

  const subjects = await prisma.subject.findMany({
    where: {
      plan: { userId, isArchived: false },
      ...(validPlanId ? { planId: validPlanId } : {})
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      planId: true
    }
  });

  const validSubjectId = subjects.some((subject) => subject.id === selectedSubjectId) ? selectedSubjectId : "";

  async function deleteAttachment(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const attachmentIdRaw = formData.get("attachmentId");
    const attachmentId = typeof attachmentIdRaw === "string" ? attachmentIdRaw : "";
    if (!attachmentId) return;

    const attachment = await prisma.topicAttachment.findFirst({
      where: {
        id: attachmentId,
        topic: {
          subject: {
            plan: { userId: currentUserId, isArchived: false }
          }
        }
      },
      select: {
        id: true,
        fileName: true,
        topic: {
          select: {
            subjectId: true
          }
        }
      }
    });

    if (!attachment) return;

    await prisma.topicAttachment.delete({ where: { id: attachment.id } });
    await deleteTopicFile(currentUserId, attachment.fileName);

    revalidatePath("/biblioteca");
    revalidatePath("/edital");
    revalidatePath(`/disciplinas/${attachment.topic.subjectId}`);
  }

  const attachmentsWhere = {
    ...(queryText
      ? {
          originalName: {
            contains: queryText,
            mode: "insensitive" as const
          }
        }
      : {}),
    topic: {
      subject: {
        plan: { userId, isArchived: false },
        ...(validPlanId ? { planId: validPlanId } : {}),
        ...(validSubjectId ? { id: validSubjectId } : {})
      }
    },
    ...(selectedFileType === "pdf"
      ? {
          OR: [{ originalName: { endsWith: ".pdf", mode: "insensitive" as const } }, { mimeType: "application/pdf" }]
        }
      : {}),
    ...(selectedFileType === "docx"
      ? {
          OR: [
            { originalName: { endsWith: ".docx", mode: "insensitive" as const } },
            { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
          ]
        }
      : {}),
    ...(selectedFileType === "planilha"
      ? {
          OR: [
            { originalName: { endsWith: ".xls", mode: "insensitive" as const } },
            { originalName: { endsWith: ".xlsx", mode: "insensitive" as const } },
            { originalName: { endsWith: ".ods", mode: "insensitive" as const } },
            { originalName: { endsWith: ".csv", mode: "insensitive" as const } },
            { mimeType: { contains: "spreadsheet", mode: "insensitive" as const } },
            { mimeType: { contains: "excel", mode: "insensitive" as const } },
            { mimeType: "text/csv" }
          ]
        }
      : {}),
    ...(selectedFileType === "imagem" ? { mimeType: { startsWith: "image/" } } : {})
  };

  const totalAttachments = await prisma.topicAttachment.count({ where: attachmentsWhere });
  const totalPages = Math.max(1, Math.ceil(totalAttachments / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageOffset = (currentPage - 1) * PAGE_SIZE;
  const pageStart = totalAttachments === 0 ? 0 : pageOffset + 1;
  const pageEnd = Math.min(pageOffset + PAGE_SIZE, totalAttachments);

  function buildPageHref(page: number) {
    const search = new URLSearchParams();
    if (queryText) search.set("q", queryText);
    if (validPlanId) search.set("planId", validPlanId);
    if (validSubjectId) search.set("subjectId", validSubjectId);
    if (selectedFileType !== "all") search.set("fileType", selectedFileType);
    if (selectedViewMode !== "list") search.set("view", selectedViewMode);
    if (page > 1) search.set("page", String(page));
    const query = search.toString();
    return query ? `/biblioteca?${query}` : "/biblioteca";
  }

  const attachments = await prisma.topicAttachment.findMany({
    where: attachmentsWhere,
    orderBy: { createdAt: "desc" },
    skip: pageOffset,
    take: PAGE_SIZE,
    select: {
      id: true,
      originalName: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      topic: {
        select: {
          id: true,
          title: true,
          subject: {
            select: {
              id: true,
              name: true,
              plan: {
                select: {
                  id: true,
                  title: true
                }
              }
            }
          }
        }
      }
    }
  });

  return (
    <main className="dashboard libraryPage">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1 className="planHeaderTitle">Biblioteca</h1>
          <p>Hub de todos os arquivos anexados nos tópicos.</p>
        </div>
      </section>

      <section className="dashboardCard">
        <form method="GET" className="libraryFilters">
          <label className="libraryFilterField">
            <span>Buscar arquivo</span>
            <input className="input" type="search" name="q" defaultValue={queryText} placeholder="Digite o nome do arquivo" />
          </label>

          <label className="libraryFilterField">
            <span>Plano</span>
            <select className="input" name="planId" defaultValue={validPlanId}>
              <option value="">Todos os planos</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>

          <label className="libraryFilterField">
            <span>Disciplina</span>
            <select className="input" name="subjectId" defaultValue={validSubjectId}>
              <option value="">Todas as disciplinas</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>

          <label className="libraryFilterField">
            <span>Tipo</span>
            <select className="input" name="fileType" defaultValue={selectedFileType}>
              {FILE_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="libraryFilterField">
            <span>Visualização</span>
            <select className="input" name="view" defaultValue={selectedViewMode}>
              <option value="list">Lista (detalhada)</option>
              <option value="grid">Grade (cards)</option>
            </select>
          </label>

          <div className="libraryFilterActions">
            <button type="submit" className="button">
              Filtrar
            </button>
            <Link className="secondaryBtn" href="/biblioteca">
              Limpar
            </Link>
          </div>
        </form>
      </section>

      <section className="dashboardCard">
        <h3>Arquivos anexados</h3>
        {attachments.length > 0 ? (
          <p className="libraryListMeta">
            Mostrando {pageStart}-{pageEnd} de {totalAttachments} arquivos.
          </p>
        ) : null}
        {attachments.length === 0 ? (
          <p className="emptyState">Nenhum arquivo encontrado com os filtros selecionados.</p>
        ) : selectedViewMode === "list" ? (
          <div className="subscriptionTableWrap">
            <table className="subscriptionTable">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Tipo</th>
                  <th>Tamanho</th>
                  <th>Plano</th>
                  <th>Disciplina</th>
                  <th>Tópico</th>
                  <th>Enviado em</th>
                  <th>Prévia</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((attachment) => {
                  const previewKind = getPreviewKind(attachment.originalName, attachment.mimeType);
                  const fileViewUrl = attachmentContentUrl(attachment.id);
                  const fileDownloadUrl = attachmentContentUrl(attachment.id, true);
                  return (
                    <tr key={attachment.id}>
                      <td>{attachment.originalName}</td>
                      <td>{getFileTypeLabel(attachment.originalName, attachment.mimeType)}</td>
                      <td>{formatSize(attachment.sizeBytes)}</td>
                      <td>{attachment.topic.subject.plan.title}</td>
                      <td>{attachment.topic.subject.name}</td>
                      <td>{attachment.topic.title}</td>
                      <td>{new Date(attachment.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td>
                        {previewKind === "none" ? (
                          <span className="emptyState">Sem prévia</span>
                        ) : (
                          <details className="libraryPreviewDetails">
                            <summary>Pré-visualizar</summary>
                            {previewKind === "image" ? (
                              <Image
                                unoptimized
                                className="libraryPreviewImage"
                                src={fileViewUrl}
                                alt={attachment.originalName}
                                width={1200}
                                height={800}
                              />
                            ) : (
                              <iframe className="libraryPreviewPdf" src={fileViewUrl} title={attachment.originalName} loading="lazy" />
                            )}
                          </details>
                        )}
                      </td>
                      <td>
                        <div className="libraryRowActions">
                          <a className="libraryActionBtn" href={fileDownloadUrl}>
                            Download
                          </a>
                          <Link className="libraryActionBtn" href={`/disciplinas/${attachment.topic.subject.id}`}>
                            Abrir origem
                          </Link>
                          <form>
                            <input type="hidden" name="attachmentId" value={attachment.id} />
                            <ConfirmSubmitButton
                              className="topicLinksRemove"
                              label="Excluir"
                              confirmTitle="Excluir arquivo"
                              confirmMessage={`Deseja realmente excluir "${attachment.originalName}"?`}
                              confirmActionLabel="Excluir"
                              formAction={deleteAttachment}
                            />
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="libraryGrid">
            {attachments.map((attachment) => {
              const previewKind = getPreviewKind(attachment.originalName, attachment.mimeType);
              const fileViewUrl = attachmentContentUrl(attachment.id);
              const fileDownloadUrl = attachmentContentUrl(attachment.id, true);
              return (
                <article key={attachment.id} className="libraryCard">
                  <header className="libraryCardHeader">
                    <h4>{attachment.originalName}</h4>
                    <span>{getFileTypeLabel(attachment.originalName, attachment.mimeType)}</span>
                  </header>

                  <p className="libraryCardMeta">
                    {formatSize(attachment.sizeBytes)} · {new Date(attachment.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="libraryCardMeta">{attachment.topic.subject.plan.title}</p>
                  <p className="libraryCardMeta">
                    {attachment.topic.subject.name} · {attachment.topic.title}
                  </p>

                  {previewKind === "none" ? (
                    <p className="emptyState">Sem prévia para este tipo.</p>
                  ) : previewKind === "image" ? (
                    <Image
                      unoptimized
                      className="libraryPreviewImage"
                      src={fileViewUrl}
                      alt={attachment.originalName}
                      width={1200}
                      height={800}
                    />
                  ) : (
                    <iframe className="libraryPreviewPdf" src={fileViewUrl} title={attachment.originalName} loading="lazy" />
                  )}

                  <div className="libraryRowActions">
                    <a className="libraryActionBtn" href={fileDownloadUrl}>
                      Download
                    </a>
                    <Link className="libraryActionBtn" href={`/disciplinas/${attachment.topic.subject.id}`}>
                      Abrir origem
                    </Link>
                    <form>
                      <input type="hidden" name="attachmentId" value={attachment.id} />
                      <ConfirmSubmitButton
                        className="topicLinksRemove"
                        label="Excluir"
                        confirmTitle="Excluir arquivo"
                        confirmMessage={`Deseja realmente excluir "${attachment.originalName}"?`}
                        confirmActionLabel="Excluir"
                        formAction={deleteAttachment}
                      />
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <nav className="libraryPagination" aria-label="Paginação da biblioteca">
            <Link
              className={`libraryPaginationBtn ${currentPage <= 1 ? "disabled" : ""}`}
              href={buildPageHref(Math.max(1, currentPage - 1))}
              aria-disabled={currentPage <= 1}
              tabIndex={currentPage <= 1 ? -1 : undefined}
            >
              Anterior
            </Link>
            <span className="libraryPaginationText">
              Página {currentPage} de {totalPages}
            </span>
            <Link
              className={`libraryPaginationBtn ${currentPage >= totalPages ? "disabled" : ""}`}
              href={buildPageHref(Math.min(totalPages, currentPage + 1))}
              aria-disabled={currentPage >= totalPages}
              tabIndex={currentPage >= totalPages ? -1 : undefined}
            >
              Próxima
            </Link>
          </nav>
        ) : null}
      </section>
    </main>
  );
}
