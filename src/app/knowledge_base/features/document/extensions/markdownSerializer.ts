// src/app/knowledge_base/extensions/markdownSerializer.ts

import MarkdownIt from "markdown-it";

const md = MarkdownIt({ html: true, linkify: true, typographer: false });

/**
 * Convert Tiptap HTML/JSON content to markdown string.
 * Uses a simple DOM-based approach since Tiptap content is essentially
 * structured HTML. Wiki-links are preserved as [[...]] in the output.
 */
export function htmlToMarkdown(html: string): string {
  // Create a temporary DOM element
  const div = document.createElement("div");
  div.innerHTML = html;
  return nodeToMarkdown(div).trim();
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  // Raw-reveal blocks render as their original tag (p/h1-6/blockquote) to
  // preserve surrounding spacing, but their text content is already markdown.
  // Emit the children as-is so the outer tag's prefix isn't applied twice.
  if (el.hasAttribute("data-raw-block")) {
    const inner = Array.from(el.childNodes).map(nodeToMarkdown).join("");
    return `${inner}\n\n`;
  }
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(nodeToMarkdown).join("");

  switch (tag) {
    case "h1": return `# ${children}\n\n`;
    case "h2": return `## ${children}\n\n`;
    case "h3": return `### ${children}\n\n`;
    case "h4": return `#### ${children}\n\n`;
    case "h5": return `##### ${children}\n\n`;
    case "h6": return `###### ${children}\n\n`;
    case "p": return `${children}\n\n`;
    case "strong": case "b": return `**${children}**`;
    case "em": case "i": return `*${children}*`;
    case "s": case "del": return `~~${children}~~`;
    case "code": {
      if (el.parentElement?.tagName.toLowerCase() === "pre") return children;
      return `\`${children}\``;
    }
    case "pre": {
      const lang = el.querySelector("code")?.className?.replace("language-", "") ?? "";
      const code = (el.querySelector("code")?.textContent ?? children).replace(/\n+$/, "");
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
    case "blockquote": return children.split("\n").filter(Boolean).map(l => `> ${l}`).join("\n") + "\n\n";
    case "ul": return `${children}\n`;
    case "ol": return `${children}\n`;
    case "li": {
      const parent = el.parentElement?.tagName.toLowerCase();
      const prefix = parent === "ol"
        ? `${Array.from(el.parentElement!.children).indexOf(el) + 1}. `
        : "- ";
      // Handle task list items
      const checkbox = el.querySelector("input[type=checkbox]");
      if (checkbox) {
        const checked = (checkbox as HTMLInputElement).checked;
        const text = children.replace(/^\s*/, "");
        return `${prefix}[${checked ? "x" : " "}] ${text}\n`;
      }
      return `${prefix}${children}\n`;
    }
    case "hr": return "---\n\n";
    case "br": return "\n";
    case "a": {
      const href = el.getAttribute("href") ?? "";
      return `[${children}](${href})`;
    }
    case "img": {
      const src = el.getAttribute("src") ?? "";
      const alt = el.getAttribute("alt") ?? "";
      return `![${alt}](${src})`;
    }
    case "span": {
      // Wiki-link nodes are rendered as spans with data-wiki-link
      if (el.dataset.wikiLink) {
        const path = el.dataset.wikiLink;
        const section = el.dataset.wikiSection;
        let link = path;
        if (section) link += `#${section}`;
        // Preserve custom display text via the `[[path|display]]` alias form
        // (the parser already understands it). Emit the short form only when
        // the span's text content matches the derived default so round-trips
        // stay compact for unrenamed links.
        const display = el.textContent ?? "";
        if (display && display !== link) {
          return `[[${link}|${display}]]`;
        }
        return `[[${link}]]`;
      }
      return children;
    }
    case "table": return tableToMarkdown(el) + "\n\n";
    case "div": return children;
    default: return children;
  }
}

// Serialize one table cell to its markdown form. Unlike the rest of
// `nodeToMarkdown`, we can't emit block-level output here: a markdown table
// cell lives on a single line between `|` delimiters. So we unwrap
// paragraph / rawBlock children to their inline markdown, join multiple
// children with `<br>` (GFM accepts it as a soft break inside cells), and
// escape any literal `|` the user typed so it doesn't split the row.
function cellToMarkdown(cell: HTMLElement): string {
  const parts: string[] = [];
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? "").trim();
      if (t) parts.push(t);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    if (el.hasAttribute("data-raw-block")) {
      // Raw-view content is already markdown syntax (asterisks, backticks,
      // etc.) plus link marks and wikiLink spans. Walking children via
      // nodeToMarkdown keeps link `[text](url)` and wiki `[[path]]` intact;
      // the final trim drops the trailing `\n\n` that the data-raw-block
      // branch in nodeToMarkdown appends for block context.
      const inner = Array.from(el.childNodes).map(nodeToMarkdown).join("").trim();
      if (inner) parts.push(inner);
      continue;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "p") {
      // Walk inline children so marks survive (<strong>x</strong> → **x**).
      // Trim to drop the trailing `\n\n` from the "p" case in nodeToMarkdown.
      const inner = Array.from(el.childNodes).map(nodeToMarkdown).join("").trim();
      if (inner) parts.push(inner);
      continue;
    }
    // Fallback for anything else a user might manage to drop into a cell
    // (headings, blockquotes, etc.). Inline the result; the trailing
    // newlines get trimmed and the block prefix (`# `, `> `) survives as
    // literal text. Markdown tables can't represent block-level cell
    // content, so this is a best-effort round-trip.
    const rendered = nodeToMarkdown(el).trim();
    if (rendered) parts.push(rendered);
  }
  // GFM + markdown-it (with html:true) accept inline `<br>` inside a cell
  // and round-trip it to a hard break in the re-parsed HTML.
  const joined = parts.join("<br>");
  // Escape every bare `|` (including inside link text) so user content
  // doesn't break row parsing. markdown-it converts `\|` back to `|`.
  return joined.replace(/\|/g, "\\|");
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const line = "| " + cells.map(c => cellToMarkdown(c as HTMLElement)).join(" | ") + " |";
    lines.push(line);
    if (i === 0) {
      lines.push("| " + cells.map(() => "---").join(" | ") + " |");
    }
  });
  return lines.join("\n");
}

/**
 * Convert markdown string to HTML for Tiptap to consume.
 * Uses markdown-it for proper parsing, with wiki-link pre-processing.
 */
export function markdownToHtml(markdown: string): string {
  // Convert wiki-links to HTML spans before markdown-it processes the content
  // (markdown-it would treat [[...]] as nested links otherwise)
  let processed = markdown.replace(/\[\[([^\]]+?)\]\]/g, (_match, inner: string) => {
    const [pathAndSection] = inner.split("|").map((s: string) => s.trim());
    const [path, section] = pathAndSection.split("#").map((s: string) => s.trim());
    const display = inner.split("|")[1]?.trim() ?? inner.split("#")[0].trim();
    return `<span data-wiki-link="${path}"${section ? ` data-wiki-section="${section}"` : ""} class="wiki-link">${display}</span>`;
  });

  // Collapse blank lines between table rows so markdown-it recognizes tables
  while (processed.includes('|\n\n|')) {
    processed = processed.replace(/\|\n\n\|/g, '|\n|');
  }

  // Convert task list markers to HTML that Tiptap understands (before markdown-it
  // turns them into plain list items)
  processed = processed.replace(/^(\s*)- \[x\]\s+/gm, '$1- <input type="checkbox" checked disabled> ');
  processed = processed.replace(/^(\s*)- \[ \]\s+/gm, '$1- <input type="checkbox" disabled> ');

  return md.render(processed);
}
