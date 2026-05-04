export function deriveExportBaseName(filePath: string | null): string {
  if (!filePath) return "tab";
  const last = filePath.split("/").pop() ?? "";
  if (!last) return "tab";
  return last.endsWith(".alphatex") ? last.slice(0, -".alphatex".length) : last;
}
