# Architecture

The Books API is a three-tier service: a thin web client, a REST gateway,
and a Postgres database for persistence. The diagram in
[[system-overview]] shows the deployed shape; this document captures the
responsibilities of each tier and the data flow.

## Tiers

### Web client

The browser-facing UI, served as a static bundle from the same origin as
the API. The client speaks REST; it never opens a connection directly to
the database. See [[api-reference]] for the full surface.

### API gateway

A small Node service that authenticates the request, rate-limits per
account, and delegates to the **Reading-list service** behind it. The
gateway is stateless — every node can serve every request, and we scale
horizontally.

### Reading-list service

The only tier that talks to Postgres. It owns the schema migrations
(`reading_lists`, `books`, `users`) and enforces invariants like "a book
appears at most once in a list".

### Postgres

Single primary, two read replicas. We keep DDL in `db/migrations/` and
use a forward-only migration policy — see [[design-decisions]] §3.

## Data flow

A typical request:

1. Client `GET /lists/:id` → API gateway authenticates the JWT.
2. Gateway forwards to the reading-list service, which queries Postgres.
3. Reading-list service responds with the list document; the gateway
   passes it through.

Errors are surfaced via the standard `{ error: { code, message } }`
envelope documented in [[api-reference]].

## Why this shape

The choice to put the gateway and service in separate processes (rather
than one Node app) is captured as ADR-2 in [[design-decisions]].
