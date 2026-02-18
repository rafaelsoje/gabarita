export function normalizeBancaName(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").toUpperCase();
}

export function parseBancaFromPlanNotes(notes: string | null | undefined) {
  if (!notes) return "";
  const match = notes.match(/(?:^|\n)\s*Banca:\s*(.+?)\s*(?:\n|$)/i);
  return normalizeBancaName(match?.[1] ?? "");
}
