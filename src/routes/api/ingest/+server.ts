import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyIngest } from '$lib/server/db';
import { parseIngestPayload } from '$lib/server/ingest';

const MAX_BODY_BYTES = 128 * 1024;

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB) return json({ error: 'database unavailable' }, { status: 503 });
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: 'payload too large' }, { status: 413 });

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'payload too large' }, { status: 413 });
  }

  try {
    const payload = parseIngestPayload(JSON.parse(body));
    const result = await applyIngest(platform.env.DB, payload);
    return json({ ok: true, ...result, checkedThroughMs: payload.checkedThroughMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid payload';
    return json({ error: message }, { status: 400 });
  }
};
