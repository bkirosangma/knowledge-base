# Roadmap

Three milestones, in priority order. Each links back to the architecture
or decisions it builds on.

## M1 — Migration tooling (Q1)

ADR-3 in [[design-decisions]] commits us to forward-only migrations, but
right now there's no automation around the "backfill before flipping to
NOT NULL" step. Without it, the next non-trivial schema change risks a
deploy that takes the service down.

- Build a `migrate apply --staged` flow that runs the column add, waits
  for backfill telemetry, then runs the `NOT NULL` flip.
- Add a CI gate: any new migration that contains `ALTER TABLE` blocks
  the merge unless paired with a runbook entry.

## M2 — Gateway-side response cache (Q2)

The reading-list service is the bottleneck under read-heavy load (see
[[architecture]] for the deployed shape). Most reads are repeats of
`GET /lists/:id` for unchanged data; caching the response at the gateway
removes ~70 % of the traffic to Postgres.

- Cache by `(user_id, list_id, ETag)`.
- Invalidate on any `POST /lists/:id/*` from the same user. The endpoint
  list is in [[api-reference]].

## M3 — Public read tokens (Q3)

Today every endpoint requires the user's JWT. Some lists are public —
"books I read in 2024", say — and the user wants to share without
logging the recipient in. We'll issue scoped read-only tokens for
specific lists.

- New endpoint: `POST /lists/:id/share` returns a 32-char public token.
- Rate-limit the public path harder than the authenticated path; the
  rate-limit envelope is already documented in [[api-reference]].
