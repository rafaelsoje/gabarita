export type TopicStudyLink = {
  id: string;
  label: string;
  url: string;
};

type ParsedTopicDescription = {
  plainText: string;
  links: TopicStudyLink[];
};

const LINKS_PREFIX = "@links ";

export function parseTopicDescription(description: string | null | undefined): ParsedTopicDescription {
  if (!description) return { plainText: "", links: [] };

  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let links: TopicStudyLink[] = [];
  const plainLines: string[] = [];

  for (const line of lines) {
    if (!line.startsWith(LINKS_PREFIX)) {
      plainLines.push(line);
      continue;
    }

    const raw = line.slice(LINKS_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(raw) as TopicStudyLink[];
      if (Array.isArray(parsed)) {
        links = parsed
          .filter((item) => !!item && typeof item.url === "string")
          .map((item) => ({
            id: typeof item.id === "string" && item.id ? item.id : cryptoRandomId(),
            label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : "Link",
            url: item.url.trim()
          }));
      }
    } catch {
      // ignore invalid metadata
    }
  }

  return {
    plainText: plainLines.join("\n"),
    links
  };
}

export function buildTopicDescription(plainText: string, links: TopicStudyLink[]) {
  const parts: string[] = [];
  const cleanText = plainText.trim();
  if (cleanText) parts.push(cleanText);
  if (links.length > 0) parts.push(`${LINKS_PREFIX}${JSON.stringify(links)}`);
  return parts.join("\n");
}

export function validateTopicDescriptionLinks(description: string | null | undefined) {
  if (!description) return { valid: true as const };

  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!line.startsWith(LINKS_PREFIX)) continue;
    const raw = line.slice(LINKS_PREFIX.length).trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { valid: false as const, message: "Metadado de links inválido." };
    }

    if (!Array.isArray(parsed)) {
      return { valid: false as const, message: "Formato de links inválido." };
    }

    if (parsed.length > 100) {
      return { valid: false as const, message: "Quantidade de links excede o limite permitido." };
    }

    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        return { valid: false as const, message: "Item de link inválido." };
      }

      const url = String((item as { url?: unknown }).url ?? "").trim();
      const label = String((item as { label?: unknown }).label ?? "").trim();
      if (!url || url.length > 2048) {
        return { valid: false as const, message: "URL de link inválida." };
      }
      if (label.length > 120) {
        return { valid: false as const, message: "Título do link excede o limite permitido." };
      }

      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return { valid: false as const, message: "Somente links http/https são permitidos." };
        }
      } catch {
        return { valid: false as const, message: "URL de link inválida." };
      }
    }
  }

  return { valid: true as const };
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
