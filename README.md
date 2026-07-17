# hermeter web

a small usage dashboard for hermeter. it reads one sanitized aggregate snapshot from cloudflare workers kv and renders a compact sveltekit dashboard with dither kit components.

> local development is unauthenticated. the canonical deployment uses separate cloudflare access policies for human dashboard access and service-token-authenticated ingest.

## what it shows

- known spend, api calls, processed tokens, and cache coverage
- daily spend and hourly activity
- model, source, and expensive-session breakdowns with selected display titles
- presets and bounded arbitrary date ranges (up to 3,660 inclusive days)
- complete, partial, stale, and unavailable coverage states

## local setup

```bash
pnpm install
pnpm build
pnpm cf:dev --port 8787
```

open `http://127.0.0.1:8787`, then publish data from the hermeter repository:

```bash
HERMETER_PUBLISH_URL=http://127.0.0.1:8787/api/ingest \
  uv run hermeter publish
```

local wrangler development uses a local kv namespace and d1 database. apply migrations before starting a fresh database:

```bash
pnpm exec wrangler d1 migrations apply hermeter --local
```

production requires the `SNAPSHOTS` kv and `DB` d1 bindings in `wrangler.jsonc`. for this migration, pause scheduled publication and use this exact rollout order:

1. apply remote d1 migrations.
2. deploy the worker.
3. run `uv run hermeter publish --force-snapshot` from the hermeter repository and verify `/api/status` plus `/api/dashboard`.
4. resume scheduled publication.

the forced full publication is required because an empty authority row cannot be seeded by a heartbeat.

## verification

```bash
pnpm verify
pnpm peers check
```

`pnpm verify` runs vitest, svelte diagnostics, and the cloudflare production build.

## data model

kv stores complete analytical snapshots under unique immutable `hermeter:snapshot:v2:*` keys that include their revision and content hash. each snapshot is a readable sparse cube keyed by local day, hour, provider, model, fixed source category, and opaque session key. each bucket contains calls, token totals, known cost, and incomplete-pricing counts. selected sanitized titles are stored separately by opaque session key.

full uploads write their versioned kv object before one small d1 control row can point to it. that row stores only the authoritative kv key, analytical content hash, revision, and coverage/freshness timestamps—never the full snapshot. d1 primary compare-and-swap serializes monotonic acceptance and rejects reused revisions with changed content. delayed or cancelled writers can leave only harmless orphan keys; they cannot overwrite the key selected by d1.

readers fetch the exact key selected by d1 and verify its revision, content hash, coverage, and freshness bounds before use. every versioned object has a 30-day ttl, so rejected or interrupted candidates expire without request-time garbage collection. unchanged publications verify and refresh the selected key's ttl before advancing freshness in d1; this keeps the live object durable while old selected keys and orphan candidates expire automatically.

coverage timestamps distinguish confirmed zero usage, the still-partial current day, stale publication, and ranges outside retained history. money is transported and stored as integer nanodollars. local day and hour projections use `Asia/Kolkata`.

legacy d1 analytics modules and the old canonical kv snapshot remain temporarily for a zero-downtime rollout: `hermeter.ingest.v1` payloads still write event rows, and readers use the canonical kv value only while the authority row is empty. the page falls back to legacy event rows only when that pre-seed canonical snapshot is absent. once authority is seeded, missing, corrupt, or mismatched versioned kv fails visibly rather than exposing stale analytics.

## privacy boundary

the versioned snapshot path contains aggregate analytic metadata: opaque session ids, local day/hour buckets, fixed source categories, model labels, token counts, known costs, pricing-completeness counts, coverage timestamps, and selected session display titles.

during the temporary rollout window, legacy `hermeter.ingest.v1` remains accepted and persists event-level rows in d1. those rows include opaque event ids, token and known-cost fields, plus pricing confidence/version metadata. the versioned snapshot path itself contains no event rows, event ids, or pricing internals; the legacy path will be removed after rollout verification.

display titles are limited to 160 characters and rejected when they contain blocked control characters, local paths including unc shares, urls including unambiguous schemeless urls, or credential-like patterns. provider and model labels pass the same credential/path/url filter. these filters reduce accidental leakage but cannot prove that a label is public-safe. no accepted path may contain prompts, responses, raw messages, tool calls or results, log lines, raw source or hermes ids, the local identity key, or credentials. the ingest validator rejects non-allowlisted fields and sources.

## production access

the canonical deployment is private behind cloudflare access:

- dashboard routes require the allowed human identity.
- `/api/ingest` requires a scoped access service token.
- `workers.dev` and preview urls are disabled in `wrangler.jsonc`, leaving the access-protected custom domain as the public route.

the app intentionally has no session or account system of its own. deployments on another domain must recreate both edge policies before accepting real data.
