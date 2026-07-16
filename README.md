# hermeter web

a small private usage dashboard for hermeter. it stores sanitized canonical usage events in cloudflare d1 and renders a compact sveltekit dashboard without a charting library.

> authentication is intentionally absent in this local-testing version. do not expose the worker or `/api/ingest` publicly until access control is added.

## what it shows

- known spend and explicit incomplete-pricing warnings
- api calls, processed tokens, and cache coverage
- daily spend and hourly activity
- model, source, and expensive-session breakdowns
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

accepted payloads contain analytic metadata only: opaque event/session ids, timestamps, fixed source categories, model labels, token counts, known costs, and pricing-completeness fields.

payloads must not contain session titles, prompts, responses, raw messages, tool calls or results, log lines, local filesystem paths, raw source or hermes ids, the local identity key, or credentials. the ingest validator rejects non-null titles and non-allowlisted sources.

## production later

before deploying:

1. create a production d1 database and replace the placeholder `database_id` in `wrangler.jsonc`.
2. apply migrations remotely.
3. add cloudflare access or equivalent authentication to both dashboard reads and ingest writes.
4. deploy the worker only after authentication is verified.
5. point the 15-minute hermeter publisher at the authenticated endpoint.

no production database, hostname, scheduler, or worker deployment is created by the local setup.
