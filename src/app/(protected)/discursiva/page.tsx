import { redirect } from "next/navigation";
import { DiscursiveReviewForm } from "@/components/discursive-review-form";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export default async function DiscursivePage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");
  const boardNames = await loadBoardNames(userId);

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Prova discursiva</h1>
          <p>Envie sua redação (texto ou imagem) para correção técnica por LLM.</p>
        </div>
      </section>

      <DiscursiveReviewForm boardNames={boardNames} />
    </main>
  );
}

async function loadBoardNames(userId: string) {
  try {
    const boards = await prisma.examBoardProfile.findMany({
      where: { userId },
      distinct: ["normalizedName"],
      orderBy: [{ normalizedName: "asc" }],
      select: {
        name: true,
        normalizedName: true
      }
    });

    return boards
      .map((board) => board.name?.trim() || board.normalizedName?.trim() || "")
      .filter((name) => name.length >= 2);
  } catch (error) {
    if (!hasMissingBoardSchema(error)) throw error;
    return [];
  }
}

function hasMissingBoardSchema(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("ExamBoardProfile") ||
    error.message.includes("styles") ||
    error.message.includes("normalizedName")
  );
}
