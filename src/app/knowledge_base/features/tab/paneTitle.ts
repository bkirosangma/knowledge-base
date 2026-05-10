// alphaTab's `scoreToMetadata` defaults `title` to "Untitled" when the
// `\title` directive is absent. Surface the file's basename instead so
// the pane header reads "scarborough_fair" rather than "Untitled" for
// fixtures that omit the directive (TAB-11.2-12).
export function paneTitleFor(filePath: string, scoreTitle: string | undefined): string {
  if (scoreTitle && scoreTitle !== "Untitled") return scoreTitle;
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.substring(0, dot);
}
