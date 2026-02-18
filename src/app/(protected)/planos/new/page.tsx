import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export default async function NewPlanPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");
  const boardProfiles = await loadBoardProfiles(userId);
  const bancaSuggestions = [
    ...new Set(
      boardProfiles
        .map((item) => sanitizeBoardName(item.name) || sanitizeBoardName(item.normalizedName))
        .map((value) => normalizeBancaName(value))
        .filter((value) => value.length >= 2)
    )
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  async function createPlan(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const titleRaw = formData.get("title");
    const notesRaw = formData.get("notes");
    const editalRaw = formData.get("edital");
    const bancaRaw = formData.get("banca");
    const roleRaw = formData.get("role");
    const genericRaw = formData.get("genericStudy");

    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    const notes = typeof notesRaw === "string" ? notesRaw.trim() : "";
    const edital = typeof editalRaw === "string" ? editalRaw.trim() : "";
    const banca = normalizeBancaName(typeof bancaRaw === "string" ? bancaRaw : "");
    const role = typeof roleRaw === "string" ? roleRaw.trim() : "";
    const genericStudy = genericRaw === "on";

    if (title.length < 2 || title.length > 160) return;

    const notesParts = [
      notes ? `Observações: ${notes}` : "",
      edital ? `Edital: ${edital}` : "",
      banca ? `Banca: ${banca}` : "",
      role ? `Cargo: ${role}` : "",
      genericStudy ? "Estudo genérico: sim" : ""
    ].filter(Boolean);

    await prisma.plan.create({
      data: {
        userId: currentUserId,
        title,
        notes: notesParts.length > 0 ? notesParts.join("\n") : undefined
      }
    });

    revalidatePath("/");
    redirect("/");
  }

  return (
    <main className="newPlanPage">
      <section className="newPlanModal">
        <h1>Novo Plano de Estudos</h1>
        <p className="newPlanSubtitle">
          Dê um nome para o seu plano de estudos e, caso queira, adicione uma imagem para identificá-lo.
        </p>

        <form action={createPlan} className="newPlanForm">
          <div className="newPlanGrid">
            <div className="newPlanImageCol">
              <label className="newPlanImageBox" htmlFor="planImage">
                <span className="newPlanImageIcon">IMG</span>
              </label>
              <input id="planImage" name="planImage" type="file" accept="image/*" className="newPlanFileInput" />
              <p className="newPlanImageText">Alterar imagem</p>
            </div>

            <div>
              <label className="fieldLabel" htmlFor="title">
                NOME DO PLANO
              </label>
              <input id="title" className="lineInput" name="title" placeholder="Ex: Auditor Fiscal + Inglês" required />

              <label className="fieldLabel" htmlFor="notes">
                OBSERVAÇÕES (OPCIONAL)
              </label>
              <textarea
                id="notes"
                className="lineInput lineTextarea"
                name="notes"
                placeholder="Aqui você pode escrever alguma observação sobre o seu plano"
                rows={3}
              />
            </div>
          </div>

          <h2>Para o que você está estudando?</h2>

          <label className="fieldLabel" htmlFor="edital">
            EDITAIS (OPCIONAL)
          </label>
          <input id="edital" className="lineInput" name="edital" />

          <label className="fieldLabel" htmlFor="role">
            CARGOS (OPCIONAL)
          </label>
          <input id="role" className="lineInput" name="role" />

          <div className="fieldLabelRow">
            <label className="fieldLabel" htmlFor="banca">
              BANCA ORGANIZADORA (OPCIONAL)
            </label>
            <Link className="secondaryBtn small fieldLabelActionBtn" href="/bancas" target="_blank" rel="noopener noreferrer">
              Ir para Bancas
            </Link>
          </div>
          <select id="banca" className="lineInput" name="banca" defaultValue="">
            <option value="">Selecione uma banca</option>
            {bancaSuggestions.map((banca) => (
              <option key={banca} value={banca}>
                {banca}
              </option>
            ))}
          </select>

          <label className="checkboxRow" htmlFor="genericStudy">
            <input id="genericStudy" type="checkbox" name="genericStudy" />
            <span>NÃO ESTOU ESTUDANDO PARA NENHUMA PROVA ESPECÍFICA</span>
          </label>

          <div className="newPlanActions">
            <Link className="ghostButton" href="/">
              Cancelar
            </Link>
            <button className="button createPlanBtn" type="submit">
              Avançar
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

async function loadBoardProfiles(userId: string) {
  try {
    const ownBoards = await prisma.examBoardProfile.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: { name: true, normalizedName: true }
    });
    if (ownBoards.length > 0) return ownBoards;

    const systemBoards = await prisma.examBoardProfile.findMany({
      distinct: ["normalizedName"],
      orderBy: [{ normalizedName: "asc" }],
      select: { name: true, normalizedName: true }
    });
    return systemBoards;
  } catch (error) {
    if (!hasMissingBoardSchema(error)) throw error;
    return [];
  }
}

function normalizeBancaName(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").toUpperCase();
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

function sanitizeBoardName(value: string | null | undefined) {
  if (!value) return "";
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
