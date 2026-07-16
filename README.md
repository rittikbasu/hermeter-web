# hermeter web

a small usage dashboard for hermeter. it stores sanitized canonical usage events in cloudflare d1 and renders a compact sveltekit dashboard with dither kit components.

> authentication is intentionally absent. a public deployment exposes dashboard data and allows untrusted ingest attempts; add access control before using it beyond a trusted single-operator setup.

## what it shows

- known spend, api calls, processed tokens, and cache coverage
- daily spend and hourly activity
- model, source, and expensive-session breakdowns with selected display titles
- presets and bounded arbitrary date ranges (up to 3,660 inclusive days)
- complete, partial, stale, and unavailable coverage states

## local setup

```bash
pnpm install
pnpm db:migrate
pnpm build
pnpm cf:dev -- --port 8787
```

open `http://127.0.0.1:8787`.

publish data from the hermeter repository:

```bash
uv run hermeter publish \
  --url http://127.0.0.1:8787/api/ingest \
  --from 2026-07-07
```

use `--from` only for the initial backfill. later runs should omit it so the publisher uses its saved cursor and one-hour retry overlap.

## verification

```bash
pnpm verify
pnpm peers check
```

`pnpm verify` runs vitest, svelte diagnostics, and the cloudflare production build.

## data model

`usage_events` contains one row per real sanitized event. deterministic event ids make retries idempotent and allow corrected events to replace earlier values.

`sync_state` records the proven coverage interval from the earliest accepted scan start through the latest accepted check time. a successful complete scan with no events advances coverage and the dashboard revision without creating synthetic usage. the dashboard uses both watermarks to distinguish:

- confirmed zero usage
- the still-partial current day
- stale publication
- ranges the publisher has not covered

money is transported and stored as integer nanodollars. local day and hour projections use `Asia/Kolkata`.

## privacy boundary

accepted payloads contain analytic metadata: opaque event/session ids, timestamps, fixed source categories, model labels, token counts, known costs, pricing-completeness fields, and selected session display titles.

display titles are limited to 160 characters and rejected when they contain blocked control characters, local paths, urls, or credential-like patterns. this filter reduces accidental leakage but cannot prove that a title is public-safe. payloads must not contain prompts, responses, raw messages, tool calls or results, log lines, raw source or hermes ids, the local identity key, or credentials. the ingest validator rejects non-allowlisted fields and sources.

## production hardening

the current deployment is intentionally single-operator and unauthenticated. before using it more broadly:

1. add cloudflare access or equivalent authentication to dashboard reads.
2. authenticate and rate-limit ingest writes.
3. point a scheduled hermeter publisher at the authenticated endpoint.
