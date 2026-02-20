export function isFormDataFileLike(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<File>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.arrayBuffer === "function"
  );
}
