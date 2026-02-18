import { ExamBoardStyle } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActionIcon } from "@/components/action-icon";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { normalizeBancaName } from "@/lib/questions/plan-notes";

const STYLE_OPTIONS: Array<{ value: ExamBoardStyle; label: string; hint: string }> = [
  { value: "MULTIPLE_CHOICE_5", label: "Múltipla escolha (5 alternativas)", hint: "A-E, uma correta." },
  { value: "MULTIPLE_CHOICE_4", label: "Múltipla escolha (4 alternativas)", hint: "A-D, uma correta." },
  { value: "MULTIPLE_CHOICE_EXCEPT_5", label: "Múltipla escolha (EXCETO)", hint: "Marcar a alternativa incorreta." },
  { value: "TRUE_FALSE_2", label: "Certo/Errado (2 alternativas)", hint: "Formato CEBRASPE." },
  { value: "ORDERING_SEQUENCE_5", label: "Ordenação / sequência lógica", hint: "Ordenar etapas, itens ou eventos." },
  { value: "ASSOCIATION_COLUMNS_5", label: "Associação de colunas", hint: "Relacionar itens da coluna A com B." },
  { value: "ASSERTION_COMBINATION_5", label: "Combinação I/II/III/IV", hint: "Alternativas com combinações." },
  { value: "ASSERTION_REASON_5", label: "Asserção e razão", hint: "Duas assertivas e relação entre elas." },
  {
    value: "MULTI_SELECT_COMBINATION_5",
    label: "Múltipla escolha (mais de uma assertiva correta)",
    hint: "Formato por combinações: mais de uma assertiva correta no enunciado."
  },
  {
    value: "GAP_FILLING_COMBINATION_5",
    label: "Lacunas (completar sentença)",
    hint: "Preencher lacunas com combinação correta."
  },
  {
    value: "CASE_STUDY_OBJECTIVE_5",
    label: "Situação-problema / caso prático",
    hint: "Enunciado contextual com decisão técnica."
  }
];

type BancasPageProps = {
  searchParams: Promise<{ toast?: string; edit?: string }>;
};

export default async function BancasPage({ searchParams }: BancasPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");
  const params = await searchParams;

  async function saveBoardAction(formData: FormData) {
    "use server";
    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const boardId = String(formData.get("boardId") ?? "").trim();
    const nameRaw = String(formData.get("name") ?? "").trim();
    const selectedStylesRaw = formData.getAll("styles");
    const instructionsRaw = String(formData.get("instructions") ?? "").trim();

    const normalizedName = normalizeBancaName(nameRaw);
    const selectedStyles = selectedStylesRaw
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(isBoardStyle);
    const normalizedStyles = Array.from(new Set(selectedStyles));
    const fallbackStyle: ExamBoardStyle = "MULTIPLE_CHOICE_5";
    const style = normalizedStyles[0] ?? fallbackStyle;
    const styles = normalizedStyles.length > 0 ? normalizedStyles : [fallbackStyle];
    if (!normalizedName) redirect("/bancas?toast=action_error");

    try {
      if (boardId) {
        const duplicate = await prisma.examBoardProfile.findFirst({
          where: {
            userId: currentUserId,
            normalizedName,
            NOT: { id: boardId }
          },
          select: { id: true }
        });
        if (duplicate) redirect("/bancas?toast=action_error");

        const updated = await prisma.examBoardProfile.updateMany({
          where: { id: boardId, userId: currentUserId },
          data: {
            name: nameRaw.slice(0, 120),
            normalizedName,
            style,
            styles,
            instructions: instructionsRaw ? instructionsRaw.slice(0, 2000) : null
          }
        });
        if (updated.count === 0) redirect("/bancas?toast=action_error");
      } else {
        await prisma.examBoardProfile.upsert({
          where: {
            userId_normalizedName: {
              userId: currentUserId,
              normalizedName
            }
          },
          create: {
            userId: currentUserId,
            name: nameRaw.slice(0, 120),
            normalizedName,
            style,
            styles,
            instructions: instructionsRaw ? instructionsRaw.slice(0, 2000) : null
          },
          update: {
            name: nameRaw.slice(0, 120),
            style,
            styles,
            instructions: instructionsRaw ? instructionsRaw.slice(0, 2000) : null
          }
        });
      }
    } catch (error) {
      if (hasMissingBoardSchema(error)) {
        redirect("/bancas?toast=boards_schema_pending");
      }
      throw error;
    }

    revalidatePath("/bancas");
    revalidatePath("/questoes");
    redirect("/bancas?toast=board_saved");
  }

  async function deleteBoardAction(formData: FormData) {
    "use server";
    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const boardId = String(formData.get("boardId") ?? "").trim();
    if (!boardId) redirect("/bancas?toast=action_error");

    try {
      await prisma.examBoardProfile.deleteMany({
        where: { id: boardId, userId: currentUserId }
      });
    } catch (error) {
      if (hasMissingBoardSchema(error)) {
        redirect("/bancas?toast=boards_schema_pending");
      }
      throw error;
    }

    revalidatePath("/bancas");
    revalidatePath("/questoes");
    redirect("/bancas?toast=board_deleted");
  }

  const boards = await loadBoards(userId);
  const editingBoardId = typeof params.edit === "string" ? params.edit.trim() : "";
  const editingBoard = editingBoardId ? boards.find((board) => board.id === editingBoardId) ?? null : null;
  const editingStyles = new Set<ExamBoardStyle>(editingBoard?.styles?.length ? editingBoard.styles : editingBoard ? [editingBoard.style] : []);

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Bancas</h1>
          <p>Cadastre o estilo da banca para guiar a geração de questões por LLM.</p>
        </div>
      </section>

      <section className="dashboardCard profileCard">
        <form className="profileForm" action={saveBoardAction}>
          <input type="hidden" name="boardId" value={editingBoard?.id ?? ""} />
          <label className="fieldLabel" htmlFor="board-name">
            NOME DA BANCA
          </label>
          <input
            id="board-name"
            className="input"
            name="name"
            placeholder="Ex.: CEBRASPE, FGV, FCC..."
            maxLength={120}
            defaultValue={editingBoard?.name ?? ""}
            required
          />

          <label className="fieldLabel" htmlFor="board-style">
            ESTILOS (PODE SELECIONAR MAIS DE UM)
          </label>
          <div id="board-style" className="boardStylesGrid">
            {STYLE_OPTIONS.map((option, index) => (
              <label key={option.value} className="checkboxRow boardStyleOption">
                <input
                  type="checkbox"
                  name="styles"
                  value={option.value}
                  defaultChecked={editingBoard ? editingStyles.has(option.value) : index === 0}
                />
                <span>
                  <b>{option.label}</b> <small>{option.hint}</small>
                </span>
              </label>
            ))}
          </div>

          <label className="fieldLabel" htmlFor="board-instructions">
            INSTRUÇÕES ADICIONAIS (OPCIONAL)
          </label>
          <textarea
            id="board-instructions"
            className="lineTextarea"
            name="instructions"
            rows={4}
            placeholder="Ex.: linguagem mais literal, pegadinhas comuns, peso de legislação seca, etc."
            maxLength={2000}
            defaultValue={editingBoard?.instructions ?? ""}
          />

          <div className="profileActions">
            <button className="button createPlanBtn" type="submit">
              {editingBoard ? "Salvar alterações" : "Salvar banca"}
            </button>
            {editingBoard ? (
              <Link href="/bancas" className="secondaryBtn">
                Cancelar edição
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section className="dashboardCard questionsListCard">
        <header className="questionsSectionHeader">
          <h2>Bancas cadastradas</h2>
          <p>{boards.length} banca(s) cadastrada(s).</p>
        </header>

        {boards.length === 0 ? (
          <p className="emptyState">Nenhuma banca cadastrada ainda.</p>
        ) : (
          <div className="questionsList">
            {boards.map((board) => (
              <article key={board.id} className="questionCard boardCard">
                <div className="boardCardContent">
                  <header className="questionCardHeader">
                    <strong>{board.name}</strong>
                    <div className="questionMetaRow">
                      {(board.styles.length > 0 ? board.styles : [board.style]).map((item) => (
                        <span key={`${board.id}-${item}`}>{styleLabel(item)}</span>
                      ))}
                      <span>{board.normalizedName}</span>
                    </div>
                  </header>
                  <p className="libraryListMeta">{board.instructions || "Sem instruções adicionais."}</p>
                </div>
                <div className="boardCardActions">
                  <Link href={`/bancas?edit=${board.id}`} className="secondaryBtn">
                    <span className="boardActionLabel">
                      <ActionIcon name="edit" className="boardActionIcon" size="sm" />
                      Editar banca
                    </span>
                  </Link>
                  <form action={deleteBoardAction}>
                    <input type="hidden" name="boardId" value={board.id} />
                    <button className="dangerBtn" type="submit">
                      <span className="boardActionLabel">
                        <ActionIcon name="remove" className="boardActionIcon" size="sm" />
                        Remover
                      </span>
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

async function loadBoards(userId: string) {
  try {
    return await prisma.examBoardProfile.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        normalizedName: true,
        style: true,
        styles: true,
        instructions: true
      }
    });
  } catch (error) {
    if (!hasMissingBoardSchema(error)) throw error;
    return [];
  }
}

function styleLabel(style: ExamBoardStyle) {
  if (style === "MULTIPLE_CHOICE_4") return "Múltipla escolha (4)";
  if (style === "MULTIPLE_CHOICE_EXCEPT_5") return "Múltipla escolha (EXCETO)";
  if (style === "TRUE_FALSE_2") return "Certo/Errado";
  if (style === "ORDERING_SEQUENCE_5") return "Ordenação / sequência lógica";
  if (style === "ASSOCIATION_COLUMNS_5") return "Associação de colunas";
  if (style === "ASSERTION_COMBINATION_5") return "Combinação I/II/III/IV";
  if (style === "ASSERTION_REASON_5") return "Asserção e razão";
  if (style === "MULTI_SELECT_COMBINATION_5") return "Múltipla escolha (mais de uma assertiva correta)";
  if (style === "GAP_FILLING_COMBINATION_5") return "Lacunas (completar sentença)";
  if (style === "CASE_STUDY_OBJECTIVE_5") return "Situação-problema / caso prático";
  return "Múltipla escolha (5)";
}

function isBoardStyle(value: string): value is ExamBoardStyle {
  return (
    value === "MULTIPLE_CHOICE_5" ||
    value === "MULTIPLE_CHOICE_4" ||
    value === "MULTIPLE_CHOICE_EXCEPT_5" ||
    value === "TRUE_FALSE_2" ||
    value === "ORDERING_SEQUENCE_5" ||
    value === "ASSOCIATION_COLUMNS_5" ||
    value === "ASSERTION_COMBINATION_5" ||
    value === "ASSERTION_REASON_5" ||
    value === "MULTI_SELECT_COMBINATION_5" ||
    value === "GAP_FILLING_COMBINATION_5" ||
    value === "CASE_STUDY_OBJECTIVE_5"
  );
}

function hasMissingBoardSchema(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("ExamBoardProfile") ||
    error.message.includes("examBoardProfile") ||
    error.message.includes("ExamBoardStyle") ||
    error.message.includes("Unknown argument")
  );
}
