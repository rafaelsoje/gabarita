import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

const ALLOWED_REGIONS = new Set([
  "ALL",
  "NACIONAL",
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
]);

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ authenticated: false }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean;
    regions?: string[];
  };

  const enabled = Boolean(body.enabled);
  const regions = normalizeRegions(Array.isArray(body.regions) ? body.regions : []);

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        notifyConcursosEnabled: enabled,
        notifyConcursosRegions: regions
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (hasMissingColumns(error)) {
      return NextResponse.json({ ok: false, message: "Banco desatualizado para notificações de concursos." }, { status: 503 });
    }
    return NextResponse.json({ ok: false, message: "Falha ao salvar preferências de concursos." }, { status: 500 });
  }
}

function normalizeRegions(regions: string[]) {
  const normalized = Array.from(
    new Set(
      regions
        .map((value) => value.trim().toUpperCase())
        .filter((value) => ALLOWED_REGIONS.has(value))
    )
  );
  return normalized.length > 0 ? normalized : ["ALL", "NACIONAL"];
}

function hasMissingColumns(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("notifyConcursosEnabled") ||
    error.message.includes("notifyConcursosRegions")
  );
}

