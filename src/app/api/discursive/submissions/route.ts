import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { listDiscursiveSubmissions } from "@/lib/storage/discursive-submissions";

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const rubric = (url.searchParams.get("rubric") ?? "").trim();
  const dateFromRaw = (url.searchParams.get("dateFrom") ?? "").trim();
  const dateToRaw = (url.searchParams.get("dateTo") ?? "").trim();
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? `${DEFAULT_PAGE_SIZE}`, 10) || DEFAULT_PAGE_SIZE)
  );

  const allSubmissions = await listDiscursiveSubmissions(userId, 5000);
  const dateFrom = parseDateStart(dateFromRaw);
  const dateTo = parseDateEnd(dateToRaw);

  const filtered = allSubmissions.filter((item) => {
    if (rubric && item.rubric !== rubric) return false;
    const createdAt = new Date(item.createdAt);
    if (dateFrom && createdAt < dateFrom) return false;
    if (dateTo && createdAt > dateTo) return false;
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const rubrics = Array.from(new Set(allSubmissions.map((item) => item.rubric).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  return NextResponse.json({
    items: pageItems.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      rubric: item.rubric,
      title: item.title,
      overallScore: item.overallScore,
      sourceType: item.sourceType,
      model: item.model
    })),
    total,
    page: safePage,
    pageSize,
    totalPages,
    rubrics
  });
}

function parseDateStart(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseDateEnd(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}
