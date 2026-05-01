# Sample vault — Books API

This vault is a small but realistic example of how you might use this
knowledge-base app to keep architecture, decisions, and roadmap notes for
a project together — diagrams, documents, and images cross-referenced via
`[[wiki-links]]`.

The project is an imaginary **Books API** — a service that tracks reading
lists and exposes a REST API for clients.

![Cover](.attachments/cover.png)

## Where to start

- [[architecture]] — high-level overview, with a diagram of the system.
- [[api-reference]] — endpoints, request/response shape, error codes.
- [[design-decisions]] — the why behind the architecture choices.
- [[roadmap]] — what's planned next.

## How this app works in 30 seconds

- Files are plain Markdown and JSON in a folder you choose. No database,
  no cloud account.
- Wiki-links like `[[architecture]]` jump to other documents and update
  themselves when you rename files.
- Diagrams live as `.json` files; the [[system-overview]] is one.
- Images you paste land in `.attachments/`; this page's cover image lives
  there.

Open any file in the explorer on the left to start exploring.
