import { ConcursoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type FeedItem = {
  id?: string;
  externalId?: string;
  titulo?: string;
  title?: string;
  orgao?: string;
  organization?: string;
  estado?: string;
  state?: string;
  esfera?: string;
  scope?: string;
  situacao?: string;
  status?: string;
  inscricoesInicio?: string;
  registrationStart?: string;
  inscricoesFim?: string;
  registrationEnd?: string;
  previsaoEdital?: string;
  expectedNoticeDate?: string;
  urlOficial?: string;
  officialUrl?: string;
  fonteUrl?: string;
  sourceUrl?: string;
  resumo?: string;
  summary?: string;
};

type FeedPayload = { items?: FeedItem[] } | FeedItem[];
type DenoConcursosPayload = {
  uf?: string;
  concursos_abertos?: Array<{ Órgão?: string; Vagas?: string }>;
  concursos_previstos?: Array<{ Órgão?: string; Vagas?: string }>;
};

type NormalizedConcurso = {
  source: string;
  externalId: string;
  title: string;
  organization: string;
  state: string | null;
  scope: string | null;
  status: ConcursoStatus;
  registrationStart: Date | null;
  registrationEnd: Date | null;
  expectedNoticeDate: Date | null;
  officialUrl: string | null;
  sourceUrl: string | null;
  summary: string | null;
  raw: FeedItem;
};

export type ConcursoFilters = {
  status?: ConcursoStatus;
  state?: string;
  source?: string;
};

const DEMO_SOURCE = "DEMO_BR";
const PCI_CONCURSOS_URL = "https://www.pciconcursos.com.br/concursos/";
const DEFAULT_CONCURSOS_FEED_TEMPLATE = "https://concursos-api.deno.dev/{uf}";
const DEFAULT_UF = "rj";
const DEFAULT_REFRESH_MINUTES = 360;

export async function syncConcursosFromSource(params?: { uf?: string }) {
  const uf = normalizeUf(params?.uf) || DEFAULT_UF;
  const feedUrls = resolveFeedUrls(uf);
  const feedToken = process.env.CONCURSOS_FEED_TOKEN?.trim();

  let importedTotal = 0;
  let removedTotal = 0;
  const syncedSources: string[] = [];
  const errors: string[] = [];

  for (const feedUrl of feedUrls) {
    try {
      const { source, items } = await fetchFeedItems(feedUrl, feedToken);
      const normalized = items
        .map((item) => normalizeFeedItem(item, source))
        .filter((item): item is NormalizedConcurso => Boolean(item));

      if (normalized.length === 0) {
        syncedSources.push(source);
        continue;
      }

      const externalIds = normalized.map((item) => item.externalId);
      const result = await prisma.$transaction(async (tx) => {
        if (source !== DEMO_SOURCE) {
          await tx.concursoListing.deleteMany({
            where: { source: DEMO_SOURCE }
          });
        }

        const removed = await tx.concursoListing.deleteMany({
          where: {
            source,
            externalId: { notIn: externalIds }
          }
        });

        for (const item of normalized) {
          await tx.concursoListing.upsert({
            where: {
              source_externalId: {
                source: item.source,
                externalId: item.externalId
              }
            },
            create: {
              source: item.source,
              externalId: item.externalId,
              title: item.title,
              organization: item.organization,
              state: item.state,
              scope: item.scope,
              status: item.status,
              registrationStart: item.registrationStart,
              registrationEnd: item.registrationEnd,
              expectedNoticeDate: item.expectedNoticeDate,
              officialUrl: item.officialUrl,
              sourceUrl: item.sourceUrl,
              summary: item.summary,
              raw: item.raw
            },
            update: {
              title: item.title,
              organization: item.organization,
              state: item.state,
              scope: item.scope,
              status: item.status,
              registrationStart: item.registrationStart,
              registrationEnd: item.registrationEnd,
              expectedNoticeDate: item.expectedNoticeDate,
              officialUrl: item.officialUrl,
              sourceUrl: item.sourceUrl,
              summary: item.summary,
              raw: item.raw
            }
          });
        }

        return {
          imported: normalized.length,
          removed: removed.count
        };
      });

      syncedSources.push(source);
      importedTotal += result.imported;
      removedTotal += result.removed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar feed.";
      errors.push(`${feedUrl}: ${message}`);
    }
  }

  if (syncedSources.length === 0) {
    const detail = errors.join(" | ");
    throw new Error(detail || "Nenhuma fonte foi sincronizada.");
  }

  return {
    source: syncedSources.join(", "),
    imported: importedTotal,
    removed: removedTotal
  };
}

export async function ensureConcursosForState(params: { uf: string; refreshMinutes?: number }) {
  const state = normalizeState(params.uf);
  if (!state) {
    throw new Error("UF inválida para sincronização.");
  }

  const refreshMinutes = normalizeRefreshMinutes(params.refreshMinutes);
  const stateStats = await prisma.concursoListing.aggregate({
    where: { state },
    _count: { _all: true },
    _max: { updatedAt: true }
  });

  const hasAny = (stateStats._count._all ?? 0) > 0;
  const lastUpdate = stateStats._max.updatedAt;
  const isFresh = hasAny && lastUpdate ? Date.now() - lastUpdate.getTime() < refreshMinutes * 60_000 : false;
  const feedUrls = resolveFeedUrls(state.toLowerCase());
  const expectsPciSource = feedUrls.some((url) => isPciConcursosUrl(url));
  const expectsNonPciSource = feedUrls.some((url) => !isPciConcursosUrl(url));

  const hasPciForState =
    (await prisma.concursoListing.count({
      where: {
        state,
        source: {
          startsWith: "PCI"
        }
      }
    })) > 0;
  const hasNonPciForState =
    (await prisma.concursoListing.count({
      where: {
        state,
        source: {
          not: {
            startsWith: "PCI"
          }
        }
      }
    })) > 0;

  // Só usa cache fresco quando as fontes esperadas para a UF já existem no banco.
  const hasExpectedPci = !expectsPciSource || hasPciForState;
  const hasExpectedNonPci = !expectsNonPciSource || hasNonPciForState;
  if (isFresh && hasExpectedPci && hasExpectedNonPci) {
    return { source: "CACHE", synced: false, stale: false };
  }

  try {
    const result = await syncConcursosFromSource({ uf: state.toLowerCase() });
    return { source: result.source, synced: true, stale: false };
  } catch (error) {
    if (hasAny) {
      return { source: "CACHE", synced: false, stale: true };
    }
    throw error;
  }
}

export async function listConcursos(filters: ConcursoFilters = {}) {
  const where: {
    status?: ConcursoStatus;
    state?: string;
    source?: string;
  } = {};

  if (filters.status) where.status = filters.status;
  if (filters.state) where.state = filters.state;
  if (filters.source) where.source = filters.source;

  return prisma.concursoListing.findMany({
    where,
    orderBy: [
      { status: "asc" },
      { registrationEnd: "asc" },
      { expectedNoticeDate: "asc" },
      { updatedAt: "desc" }
    ]
  });
}

export async function ensureConcursosSeeded(uf?: string) {
  const stats = await prisma.concursoListing.groupBy({
    by: ["source"],
    _count: { source: true }
  });

  if (stats.length === 0) {
    await syncConcursosFromSource({ uf });
    return true;
  }

  const onlyDemo = stats.every((item) => item.source === DEMO_SOURCE);
  if (onlyDemo) {
    await syncConcursosFromSource({ uf });
    return true;
  }

  return false;
}

export function getDefaultConcursosFeedUrl() {
  return DEFAULT_CONCURSOS_FEED_TEMPLATE.replace("{uf}", DEFAULT_UF);
}

export function getDemoSourceName() {
  return DEMO_SOURCE;
}

export async function listConcursosFilterOptions() {
  const [states, sources] = await Promise.all([
    prisma.concursoListing.findMany({
      where: { state: { not: null } },
      distinct: ["state"],
      orderBy: { state: "asc" },
      select: { state: true }
    }),
    prisma.concursoListing.findMany({
      distinct: ["source"],
      orderBy: { source: "asc" },
      select: { source: true }
    })
  ]);

  return {
    states: states.map((item) => item.state).filter((item): item is string => Boolean(item)),
    sources: sources.map((item) => item.source)
  };
}

async function fetchFeedItems(feedUrl: string, feedToken?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(feedUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(feedToken ? { Authorization: `Bearer ${feedToken}` } : {})
      }
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar feed de concursos: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("text/html") || isPciConcursosUrl(feedUrl)) {
      const html = await response.text();
      const pciParsed = parsePciConcursosHtml(html);
      if (pciParsed.items.length > 0) {
        return pciParsed;
      }
      throw new Error("PCI Concursos retornou HTML sem itens reconhecíveis.");
    }

    const payload = (await response.json()) as FeedPayload | DenoConcursosPayload;
    const denoParsed = parseDenoConcursosPayload(payload, feedUrl);
    if (denoParsed) {
      return denoParsed;
    }

    const items = Array.isArray(payload)
      ? payload
      : "items" in payload && Array.isArray(payload.items)
        ? payload.items
        : [];
    return {
      source: `FEED:${safeSourceLabel(feedUrl)}`,
      items
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFeedItem(item: FeedItem, source: string): NormalizedConcurso | null {
  const title = sanitizeText(item.titulo ?? item.title ?? "");
  const organization = sanitizeText(item.orgao ?? item.organization ?? "");
  if (!title || !organization) return null;

  const state = normalizeState(item.estado ?? item.state ?? null);
  const status = normalizeStatus(item.situacao ?? item.status);
  const scope = sanitizeText(item.esfera ?? item.scope ?? "") || null;

  return {
    source,
    externalId: sanitizeText(item.id ?? item.externalId ?? "") || createExternalId(title, organization, state, status),
    title,
    organization,
    state,
    scope,
    status,
    registrationStart: parseDate(item.inscricoesInicio ?? item.registrationStart),
    registrationEnd: parseDate(item.inscricoesFim ?? item.registrationEnd),
    expectedNoticeDate: parseDate(item.previsaoEdital ?? item.expectedNoticeDate),
    officialUrl: normalizeUrl(item.urlOficial ?? item.officialUrl ?? null),
    sourceUrl: normalizeUrl(item.fonteUrl ?? item.sourceUrl ?? null),
    summary: sanitizeText(item.resumo ?? item.summary ?? "") || null,
    raw: item
  };
}

function normalizeStatus(input?: string | null): ConcursoStatus {
  const text = (input ?? "").trim().toLowerCase();
  if (["open", "aberto", "abertas", "inscricoes abertas", "inscrição aberta"].includes(text)) {
    return ConcursoStatus.OPEN;
  }
  return ConcursoStatus.PLANNED;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sanitizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeState(value?: string | null) {
  if (!value) return null;
  const state = value.trim().toUpperCase();
  if (state.length === 2) return state;
  return null;
}

function normalizeUrl(value?: string | null) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.toString();
  } catch {
    return null;
  }
}

function createExternalId(title: string, organization: string, state: string | null, status: ConcursoStatus) {
  return [organization, title, state ?? "ALL", status]
    .join("-")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function safeSourceLabel(feedUrl: string) {
  try {
    return new URL(feedUrl).host;
  } catch {
    return "external";
  }
}

function parseDenoConcursosPayload(payload: FeedPayload | DenoConcursosPayload, feedUrl: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!("concursos_abertos" in payload) && !("concursos_previstos" in payload)) return null;

  const parsed = payload as DenoConcursosPayload;
  const uf = (parsed.uf ?? "").trim().toUpperCase();
  const state = /^[A-Z]{2}$/.test(uf) ? uf : null;
  const source = state ? `DENO:${state}` : `FEED:${safeSourceLabel(feedUrl)}`;

  const open = (parsed.concursos_abertos ?? []).map((item, index) => ({
    externalId: `open-${state ?? "br"}-${index + 1}`,
    title: sanitizeText(item.Órgão ?? ""),
    organization: sanitizeText(item.Órgão ?? ""),
    state,
    status: "aberto",
    summary: item.Vagas ? `Vagas: ${sanitizeText(item.Vagas)}` : null
  }));
  const planned = (parsed.concursos_previstos ?? []).map((item, index) => ({
    externalId: `planned-${state ?? "br"}-${index + 1}`,
    title: sanitizeText(item.Órgão ?? ""),
    organization: sanitizeText(item.Órgão ?? ""),
    state,
    status: "previsto",
    summary: item.Vagas ? `Vagas: ${sanitizeText(item.Vagas)}` : null
  }));

  const items: FeedItem[] = [...open, ...planned]
    .filter((item) => Boolean(item.title))
    .map((item) => ({
      id: item.externalId,
      title: item.title,
      organization: item.organization,
      state: item.state ?? undefined,
      status: item.status,
      summary: item.summary ?? undefined,
      sourceUrl: feedUrl
    }));

  return {
    source,
    items
  };
}

function normalizeUf(value?: string | null) {
  if (!value) return "";
  const uf = value.trim().toLowerCase();
  return /^[a-z]{2}$/.test(uf) ? uf : "";
}

function resolveFeedUrls(uf: string) {
  const configured = (process.env.CONCURSOS_FEED_URLS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const fallbackUrl = process.env.CONCURSOS_FEED_URL?.trim() || process.env.CONCURSOS_FEED_TEMPLATE?.trim() || DEFAULT_CONCURSOS_FEED_TEMPLATE;
  const defaultSources = [PCI_CONCURSOS_URL, fallbackUrl];
  const sources = configured.length > 0 ? configured : defaultSources;
  const normalized = sources.map((source) => source.replaceAll("{uf}", uf));
  return Array.from(new Set(normalized));
}

function normalizeRefreshMinutes(value?: number) {
  const envValue = parseIntSafe(process.env.CONCURSOS_REFRESH_MINUTES, DEFAULT_REFRESH_MINUTES);
  const selected = Number.isFinite(value) && (value ?? 0) > 0 ? Number(value) : envValue;
  return selected > 0 ? selected : DEFAULT_REFRESH_MINUTES;
}

function parseIntSafe(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPciConcursosUrl(url: string) {
  return /pciconcursos\.com\.br\/concursos\/?$/i.test(url.trim());
}

function parsePciConcursosHtml(html: string) {
  const items: FeedItem[] = [];
  const sectionMarkerRegex = /<div id="([A-Z]{2}|NACIONAL)" class="ua">/g;
  const sectionMarkers: Array<{ stateId: string; index: number }> = [];
  let sectionMatch: RegExpExecArray | null = null;
  while ((sectionMatch = sectionMarkerRegex.exec(html)) !== null) {
    sectionMarkers.push({ stateId: sectionMatch[1], index: sectionMatch.index });
  }

  for (let i = 0; i < sectionMarkers.length; i += 1) {
    const current = sectionMarkers[i];
    if (!current) continue;
    const next = sectionMarkers[i + 1];
    const isNationalSection = current.stateId === "NACIONAL";
    const state = isNationalSection ? null : normalizeState(current.stateId);
    if (!isNationalSection && !state) continue;

    const sectionHtml = html.slice(current.index, next?.index ?? html.length);
    const cardBlocks = extractPciCardBlocks(sectionHtml);

    for (const block of cardBlocks) {
      const anchorMatch = block.html.match(/<div class="ca"><a href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      const cdMatch = block.html.match(/<div class="cd">([\s\S]*?)<\/div>/i);
      const ceMatch = block.html.match(/<div class="ce"><span>([\s\S]*?)<\/span><\/div>/i);
      if (!anchorMatch || !cdMatch || !ceMatch) continue;

      const href = normalizeUrl(anchorMatch[1]);
      const titleAttr = sanitizeText(htmlDecode(anchorMatch[2]));
      const orgName = sanitizeText(htmlDecode(stripTags(anchorMatch[3])));
      const cdRaw = htmlDecode(cdMatch[1]);
      const ceRaw = htmlDecode(ceMatch[1]);
      const vagas = extractVagas(cdRaw);
      const { registrationStart, registrationEnd } = parsePciDateRange(ceRaw);
      const status = resolvePciStatus(registrationStart);
      const summaryParts = [vagas ? `Vagas: ${vagas}` : "", extractPciRole(cdRaw)].filter(Boolean);

      if (!orgName && !titleAttr) continue;
      items.push({
        id: createExternalId(titleAttr || orgName, orgName || titleAttr, state, status),
        title: titleAttr || orgName,
        organization: orgName || titleAttr,
        state: state ?? undefined,
        scope: isNationalSection ? "NACIONAL" : undefined,
        status: status === ConcursoStatus.OPEN ? "aberto" : "previsto",
        summary: summaryParts.join(" • ") || undefined,
        registrationStart,
        registrationEnd,
        sourceUrl: href ?? PCI_CONCURSOS_URL
      });
    }
  }

  return {
    source: "PCI_BR",
    items
  };
}

function extractPciCardBlocks(sectionHtml: string) {
  const cards: Array<{ cardType: "da" | "na" | "ea"; html: string }> = [];
  const startRegex = /<div class="(da|na|ea)"[^>]*>/gi;
  let startMatch: RegExpExecArray | null = null;

  while ((startMatch = startRegex.exec(sectionHtml)) !== null) {
    const cardType = (startMatch[1] ?? "").toLowerCase() as "da" | "na" | "ea";
    const startIndex = startMatch.index;
    const divTagRegex = /<div\b[^>]*>|<\/div>/gi;
    divTagRegex.lastIndex = startIndex;

    let depth = 0;
    let endIndex = -1;
    let tagMatch: RegExpExecArray | null = null;
    while ((tagMatch = divTagRegex.exec(sectionHtml)) !== null) {
      const token = tagMatch[0];
      if (token.startsWith("</div")) {
        depth -= 1;
        if (depth === 0) {
          endIndex = divTagRegex.lastIndex;
          break;
        }
      } else {
        depth += 1;
      }
    }

    if (endIndex === -1) continue;
    const cardHtml = sectionHtml.slice(startIndex, endIndex);
    cards.push({ cardType, html: cardHtml });
    startRegex.lastIndex = endIndex;
  }

  return cards;
}

function extractVagas(cdRaw: string) {
  const firstLine = sanitizeText(stripTags(cdRaw).split("\n")[0] ?? "");
  const match = firstLine.match(/([\d\.\,]+)\s*vagas?/i);
  if (match?.[1]) return match[1];
  if (/vagas?/i.test(firstLine)) return "Várias";
  return "";
}

function extractPciRole(cdRaw: string) {
  const normalized = cdRaw.replace(/<br\s*\/?>/gi, "\n");
  const lines = stripTags(normalized)
    .split("\n")
    .map((item) => sanitizeText(item))
    .filter(Boolean);
  return lines[1] ?? "";
}

function parsePciDateRange(value: string) {
  const text = value.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
  const matches = text.match(/\d{2}\/\d{2}(?:\/\d{4})?/g) ?? [];
  if (matches.length === 0) {
    return { registrationStart: undefined, registrationEnd: undefined };
  }

  const firstToken = matches[0];
  const lastToken = matches[matches.length - 1];
  if (!firstToken || !lastToken) {
    return { registrationStart: undefined, registrationEnd: undefined };
  }

  const endDate = parsePtBrDate(lastToken, new Date().getFullYear());
  const inferredYear = endDate?.getFullYear() ?? new Date().getFullYear();
  const startDate = parsePtBrDate(firstToken, inferredYear);
  const hasRange = matches.length >= 2 && firstToken !== lastToken;

  return {
    registrationStart: hasRange && startDate ? toIsoDate(startDate) : undefined,
    registrationEnd: endDate ? toIsoDate(endDate) : undefined
  };
}

function resolvePciStatus(registrationStart?: string) {
  if (!registrationStart) return ConcursoStatus.OPEN;
  const start = new Date(`${registrationStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return ConcursoStatus.OPEN;
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return start.getTime() > todayUtc.getTime() ? ConcursoStatus.PLANNED : ConcursoStatus.OPEN;
}

function parsePtBrDate(raw: string, fallbackYear: number) {
  const cleaned = raw.trim();
  const [dayRaw, monthRaw, yearRaw] = cleaned.split("/");
  const day = Number.parseInt(dayRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : fallbackYear;
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function htmlDecode(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
