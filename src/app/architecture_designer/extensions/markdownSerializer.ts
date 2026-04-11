// src/app/architecture_designer/extensions/markdownSerializer.ts

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
      const code = el.querySelector("code")?.textContent ?? children;
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
        return `[[${link}]]`;
      }
      return children;
    }
    case "table": return tableToMarkdown(el) + "\n\n";
    case "div": return children;
    default: return children;
  }
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const line = "| " + cells.map(c => c.textContent?.trim() ?? "").join(" | ") + " |";
    lines.push(line);
    if (i === 0) {
      lines.push("| " + cells.map(() => "---").join(" | ") + " |");
    }
  });
  return lines.join("\n");
}

/**
 * Convert markdown string to HTML for Tiptap to consume.
 * Handles wiki-links by converting [[...]] to <span data-wiki-link="...">
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Preserve wiki-links before other processing
  html = html.replace(/\[\[([^\]]+?)\]\]/g, (_match, inner: string) => {
    const [pathAndSection] = inner.split("|").map((s: string) => s.trim());
    const [path, section] = pathAndSection.split("#").map((s: string) => s.trim());
    const display = inner.split("|")[1]?.trim() ?? inner.split("#")[0].trim();
    return `<span data-wiki-link="${path}"${section ? ` data-wiki-section="${section}"` : ""} class="wiki-link">${display}</span>`;
  });

  // Basic markdown to HTML (covers the essentials — Tiptap handles the rest)
  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  // Headings
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  // Bold, italic, strikethrough, inline code
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");
  // Images and links
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, "<blockquote><p>$1</p></blockquote>");
  // Task lists
  html = html.replace(/^- \[x\]\s+(.+)$/gm, '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">$1</li></ul>');
  html = html.replace(/^- \[ \]\s+(.+)$/gm, '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">$1</li></ul>');
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<ul><li>$1</li></ul>");
  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<ol><li>$1</li></ol>");
  // Paragraphs (lines not already wrapped)
  html = html.replace(/^(?!<[a-z])(.*[^\n])$/gm, (_, content) => {
    if (!content.trim()) return "";
    return `<p>${content}</p>`;
  });

  return html;
}
