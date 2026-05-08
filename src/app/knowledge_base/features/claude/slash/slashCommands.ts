export interface SlashCommand {
  /** Raw subcommand identifier — matches the file name in skills/knowledge-base/commands/ minus .md. */
  id: string;
  /** Pretty label shown in the palette. */
  label: string;
  /** One-line description. */
  description: string;
  /** Template inserted when selected. Trailing space on purpose. */
  template: string;
}

/** Hard-coded for MVP-3. Update when a new command lands in skills/knowledge-base/commands/. */
export const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  { id: "create", label: "/kb create", description: "Generate a document and linked diagram together.", template: "/kb create " },
  { id: "diagram", label: "/kb diagram", description: "Generate a diagram on a topic.", template: "/kb diagram " },
  { id: "document", label: "/kb document", description: "Generate a standalone document on a topic.", template: "/kb document " },
  { id: "edit", label: "/kb edit", description: "Edit an existing diagram JSON.", template: "/kb edit " },
  { id: "guitar-tabs", label: "/kb guitar-tabs", description: "Generate a playable guitar tab.", template: "/kb guitar-tabs " },
  { id: "svg", label: "/kb svg", description: "Generate a music SVG visualization.", template: "/kb svg " },
  { id: "transform", label: "/kb transform", description: "Conform an existing file to skill format.", template: "/kb transform " },
  { id: "validate", label: "/kb validate", description: "Validate (and optionally auto-fix) a diagram JSON.", template: "/kb validate " },
];

/** Returns the filtered subset that should appear given the current composer value. */
export function filterSlashCommands(value: string): ReadonlyArray<SlashCommand> {
  if (!isSlashTrigger(value)) return [];
  const query = value.slice(1).toLowerCase(); // drop leading "/"
  if (query.length === 0) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.id.startsWith(query));
}

export function isSlashTrigger(value: string): boolean {
  return /^\/[a-z-]*$/.test(value);
}
