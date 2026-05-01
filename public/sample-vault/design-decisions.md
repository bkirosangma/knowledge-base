# Design decisions

Architecture Decision Records (ADRs) for the Books API. Each entry
captures the choice, the alternatives considered, and the trade-off
that drove the decision. Earlier ADRs aren't superseded silently — when
a decision changes, we add a new ADR and link it.

## ADR-1 — Stable error codes over translated messages

**Date:** 2024-09-12 · **Status:** accepted

We expose machine-readable codes in error responses (`list_not_found`,
`rate_limited`, …) rather than localised messages. Clients render their
own copy from the code.

- **Why not translated messages?** Translations belong on the client —
  the server doesn't know the user's locale during early auth, and
  multiple clients (web, mobile) want different tone.
- **Why not HTTP status only?** `404` covers too many cases. The code
  disambiguates `list_not_found` from `book_not_found`.

The full code list lives in [[api-reference]].

## ADR-2 — API gateway and service as separate processes

**Date:** 2024-10-04 · **Status:** accepted

The gateway (auth, rate-limit) and the reading-list service (Postgres,
business logic) run as two processes, not one. See [[architecture]] for
the deployed shape.

- **Trade-off:** an extra hop adds ~3 ms latency. We accept that for the
  ability to scale auth independently — auth checks are CPU-cheap and
  don't need replicas of the service tier.
- **Alternative considered:** a single Node app exposing both
  responsibilities. Rejected because rolling auth-only changes would
  redeploy the database-touching service unnecessarily.

## ADR-3 — Forward-only migrations

**Date:** 2024-11-30 · **Status:** accepted

DDL changes are forward-only. We never write a `down` migration; if a
deploy needs reverting, the next forward migration restores the previous
shape.

- **Why:** down migrations are written but rarely tested, and the kind
  of change you'd revert often loses data anyway. A new forward
  migration forces an explicit recovery plan.
- **Caveat:** every column add must be backwards-compatible with the
  previous service version (nullable, default NULL, or backfill before
  flipping to NOT NULL). See [[roadmap]] for the planned tooling.
