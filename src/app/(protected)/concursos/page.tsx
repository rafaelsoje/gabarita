import { ConcursoStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { ConcursosFiltersForm } from "@/components/concursos-filters-form";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { ensureConcursosForState, listConcursos } from "@/lib/concursos/service";

type ConcursosPageProps = {
  searchParams: Promise<{
    status?: string;
    state?: string;
    includeNational?: string;
    syncError?: string;
  }>;
};

export default async function ConcursosPage({ searchParams }: ConcursosPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  const params = await searchParams;
  const statusFilter = normalizeStatusFilter(params.status);
  const stateFilter = normalizeStateOrNationalFilter(params.state) || "RJ";
  const includeNational = params.includeNational === "1";
  let syncError = normalizeTextFilter(params.syncError);
  let dataOrigin: "CACHE" | "API" = "CACHE";
  const syncState = stateFilter === "NACIONAL" ? "RJ" : stateFilter;

  if (syncState) {
    try {
      const ensured = await ensureConcursosForState({ uf: syncState });
      dataOrigin = ensured.synced ? "API" : "CACHE";
      if (ensured.stale) {
        syncError = "API indisponível no momento. Exibindo dados salvos no banco.";
      }
    } catch (error) {
      syncError = error instanceof Error ? error.message.slice(0, 400) : "Erro desconhecido de sincronização.";
    }
  }

  const allConcursos = await listConcursos();
  const concursosBase = allConcursos.filter((item) => {
    if (!isRegistrationStillValid(item.registrationEnd)) return false;
    return matchesStateFilter(item.state, stateFilter, includeNational);
  });
  const openConcursos = concursosBase
    .filter((item) => item.status === ConcursoStatus.OPEN && isPciSource(item.source))
    .sort(sortNationalFirst);
  const plannedConcursos = concursosBase
    .filter((item) => item.status === ConcursoStatus.PLANNED && isDenoSource(item.source))
    .sort(sortNationalFirst);
  const concursos =
    statusFilter === ConcursoStatus.OPEN
      ? openConcursos
      : statusFilter === ConcursoStatus.PLANNED
        ? plannedConcursos
        : [...openConcursos, ...plannedConcursos];

  const openCount = openConcursos.length;
  const plannedCount = plannedConcursos.length;
  const lastSync = concursosBase.reduce<Date | null>((latest, item) => {
    if (!latest) return item.updatedAt;
    return item.updatedAt > latest ? item.updatedAt : latest;
  }, null);

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1>Concursos</h1>
          <p>Selecione o estado para sincronizar e listar apenas os concursos daquela UF.</p>
        </div>
      </section>

      <section className="provasMetricsGrid concursosMetricsGrid">
        <article className="dashboardCard provasMetricCard concursosMetricCard">
          <small>Abertos</small>
          <strong className="concursosMetricValue">{openCount}</strong>
        </article>
        <article className="dashboardCard provasMetricCard concursosMetricCard">
          <small>Previstos</small>
          <strong className="concursosMetricValue">{plannedCount}</strong>
        </article>
        <article className="dashboardCard provasMetricCard concursosMetricCard">
          <small>Última atualização</small>
          <span className={`concursosDataOriginBadge topRight ${dataOrigin === "API" ? "api" : "cache"}`}>
            {dataOrigin === "API" ? "Atualizado da API" : "Dados em cache"}
          </span>
          <strong className="concursosMetricValue isDate">{lastSync ? formatDateTime(lastSync) : "-"}</strong>
        </article>
        <article className="dashboardCard provasMetricCard concursosMetricCard">
          <small>Cobertura</small>
          <strong className="concursosMetricValue isSource">{includeNational ? "UF + Nacionais" : "Somente UF"}</strong>
        </article>
      </section>

      {syncError ? (
        <section className="dashboardCard">
          <strong>Erro técnico de sincronização</strong>
          <p className="libraryListMeta">{syncError}</p>
        </section>
      ) : null}

      <section className="dashboardCard historyFiltersCard">
        <ConcursosFiltersForm
          selectedStatus={statusFilter}
          selectedState={stateFilter}
          selectedIncludeNational={includeNational}
          states={UF_OPTIONS}
        />
      </section>

      <section className="dashboardCard questionsListCard">
        <header className="questionsSectionHeader">
          <h2>Lista de concursos</h2>
          <p>{concursos.length} item(ns) encontrado(s).</p>
        </header>

        {!stateFilter ? (
          <p className="emptyState">Selecione um estado para carregar os concursos.</p>
        ) : concursos.length === 0 ? (
          <p className="emptyState">Nenhum concurso encontrado para os filtros aplicados.</p>
        ) : statusFilter === "" ? (
          <div className="questionsList concursosList">
            <header className="questionsSectionHeader">
              <h3>Abertos</h3>
              <p>{openConcursos.length} item(ns).</p>
            </header>
            {openConcursos.map((item) => (
              <ConcursoCard key={item.id} item={item} />
            ))}

            <header className="questionsSectionHeader">
              <h3>Previstos</h3>
              <p>{plannedConcursos.length} item(ns).</p>
            </header>
            {plannedConcursos.map((item) => (
              <ConcursoCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="questionsList concursosList">
            {concursos.map((item) => (
              <ConcursoCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function normalizeStatusFilter(value?: string) {
  if (value === ConcursoStatus.OPEN || value === ConcursoStatus.PLANNED) {
    return value;
  }
  return "";
}

function normalizeStateOrNationalFilter(value?: string) {
  if (!value) return "";
  const normalized = value.trim().toUpperCase();
  if (normalized === "NACIONAL") return "NACIONAL";
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
}

function normalizeTextFilter(value?: string) {
  return value?.trim() || "";
}

function isRegistrationStillValid(registrationEnd: Date | null) {
  if (!registrationEnd) return true;
  return getUtcDateKey(registrationEnd) >= getUtcDateKey(new Date());
}

function getDeadlineTone(registrationEnd: Date | null) {
  if (!registrationEnd) return "none";
  const daysRemaining = getUtcDayDiff(registrationEnd, new Date());
  if (daysRemaining <= 0) return "today";
  if (daysRemaining <= 3) return "near";
  return "long";
}

function getDeadlineToneClass(registrationEnd: Date | null) {
  const tone = getDeadlineTone(registrationEnd);
  if (tone === "today") return "isToday";
  if (tone === "near") return "isNear";
  if (tone === "long") return "isLong";
  return "";
}

function getDeadlineLabel(registrationEnd: Date | null) {
  const tone = getDeadlineTone(registrationEnd);
  if (tone === "today") return "Hoje";
  if (tone === "near") return "Prazo curto";
  if (tone === "long") return "Prazo longo";
  return "";
}

function getUtcDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUtcDayDiff(target: Date, reference: Date) {
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const referenceUtc = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  return Math.floor((targetUtc - referenceUtc) / 86_400_000);
}

function matchesStateFilter(itemState: string | null, stateFilter: string, includeNational: boolean) {
  if (!stateFilter) return true;
  if (stateFilter === "NACIONAL") return itemState === null;
  if (itemState === stateFilter) return true;
  return includeNational && itemState === null;
}

function sortNationalFirst(left: { state: string | null }, right: { state: string | null }) {
  const leftRank = left.state === null ? 0 : 1;
  const rightRank = right.state === null ? 0 : 1;
  return leftRank - rightRank;
}

function isPciSource(source: string) {
  return source.startsWith("PCI");
}

function isDenoSource(source: string) {
  return source.startsWith("DENO");
}

function ConcursoCard({
  item
}: {
  item: {
    id: string;
    title: string;
    status: ConcursoStatus;
    organization: string;
    state: string | null;
    scope: string | null;
    source: string;
    summary: string | null;
    registrationStart: Date | null;
    registrationEnd: Date | null;
    expectedNoticeDate: Date | null;
    officialUrl: string | null;
    sourceUrl: string | null;
  };
}) {
  const showSourceLinks = item.status === ConcursoStatus.OPEN;

  return (
    <article className="questionCard concursosListItemCard">
      <header className="questionCardHeader">
        <div className="concursosTitleRow">
          <strong>{item.title}</strong>
          {getDeadlineTone(item.registrationEnd) === "today" ? (
            <span className="concursosDeadlineAlert">Último dia das inscrições</span>
          ) : null}
        </div>
        <div className="questionMetaRow">
          <span>{item.status === ConcursoStatus.OPEN ? "Aberto" : "Previsto"}</span>
          <span>{item.organization}</span>
          {item.state ? <span>{item.state}</span> : null}
          {item.scope ? <span>{item.scope}</span> : null}
          <span>{item.source}</span>
        </div>
      </header>

      <p className="libraryListMeta">{item.summary || "Sem resumo disponível."}</p>
      <div className="questionMetaRow concursosMetaRowCompact">
        <span>Inscrições: {item.registrationStart ? formatDate(item.registrationStart) : "-"}</span>
        <span className="concursosDeadlineCell">
          Fim inscrições: {item.registrationEnd ? formatDate(item.registrationEnd) : "-"}
          {item.registrationEnd ? (
            <span className={`concursosDeadlineTag ${getDeadlineToneClass(item.registrationEnd)}`}>
              {getDeadlineLabel(item.registrationEnd)}
            </span>
          ) : null}
        </span>
        <span>Previsão edital: {item.expectedNoticeDate ? formatDate(item.expectedNoticeDate) : "-"}</span>
      </div>
      {showSourceLinks && item.officialUrl ? (
        <div className="historyActions concursosCardActions">
          <a className="secondaryBtn" href={item.officialUrl} target="_blank" rel="noreferrer">
            Link oficial
          </a>
          {item.sourceUrl ? (
            <a className="secondaryBtn" href={item.sourceUrl} target="_blank" rel="noreferrer">
              Fonte
            </a>
          ) : null}
        </div>
      ) : showSourceLinks && item.sourceUrl ? (
        <div className="historyActions concursosCardActions">
          <a className="secondaryBtn" href={item.sourceUrl} target="_blank" rel="noreferrer">
            Fonte
          </a>
        </div>
      ) : null}
    </article>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

const UF_OPTIONS = [
  { value: "NACIONAL", label: "NACIONAL - Somente nacionais" },
  { value: "AC", label: "AC - Acre" },
  { value: "AL", label: "AL - Alagoas" },
  { value: "AP", label: "AP - Amapá" },
  { value: "AM", label: "AM - Amazonas" },
  { value: "BA", label: "BA - Bahia" },
  { value: "CE", label: "CE - Ceará" },
  { value: "DF", label: "DF - Distrito Federal" },
  { value: "ES", label: "ES - Espírito Santo" },
  { value: "GO", label: "GO - Goiás" },
  { value: "MA", label: "MA - Maranhão" },
  { value: "MT", label: "MT - Mato Grosso" },
  { value: "MS", label: "MS - Mato Grosso do Sul" },
  { value: "MG", label: "MG - Minas Gerais" },
  { value: "PA", label: "PA - Pará" },
  { value: "PB", label: "PB - Paraíba" },
  { value: "PR", label: "PR - Paraná" },
  { value: "PE", label: "PE - Pernambuco" },
  { value: "PI", label: "PI - Piauí" },
  { value: "RJ", label: "RJ - Rio de Janeiro" },
  { value: "RN", label: "RN - Rio Grande do Norte" },
  { value: "RS", label: "RS - Rio Grande do Sul" },
  { value: "RO", label: "RO - Rondônia" },
  { value: "RR", label: "RR - Roraima" },
  { value: "SC", label: "SC - Santa Catarina" },
  { value: "SP", label: "SP - São Paulo" },
  { value: "SE", label: "SE - Sergipe" },
  { value: "TO", label: "TO - Tocantins" }
] as const;
