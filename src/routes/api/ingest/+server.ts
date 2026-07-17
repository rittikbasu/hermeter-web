import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyIngest } from '$lib/server/db';
import { parseIngestPayload } from '$lib/server/ingest';
import { parseHeartbeat, parseSnapshot } from '$lib/server/snapshot';
import {
  CasSnapshotAuthority,
  D1SnapshotAuthorityPersistence,
  StaleSnapshotError,
  saveOrderedHeartbeat,
  saveOrderedSnapshot
} from '$lib/server/ordered-snapshot-store';

const MAX_BODY_BYTES = 5 * 1024 * 1024;

class PayloadTooLargeError extends Error {}

async function boundedBody(request: Request): Promise<string> {
  const declaredValue = request.headers.get('content-length');
  if (declaredValue !== null) {
    const declared = Number(declaredValue);
    if (!Number.isSafeInteger(declared) || declared < 0) throw new Error('invalid content-length');
    if (declared > MAX_BODY_BYTES) throw new PayloadTooLargeError();
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export const POST: RequestHandler = async ({ request, platform }) => {
  let body: string;
  try {
    body = await boundedBody(request);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return json({ error: 'payload too large' }, { status: 413 });
    }
    return json({ error: 'invalid request body' }, { status: 400 });
  }

  let payload:
    | ReturnType<typeof parseIngestPayload>
    | ReturnType<typeof parseSnapshot>
    | ReturnType<typeof parseHeartbeat>;
  try {
    const value = JSON.parse(body) as { schema?: unknown };
    payload = value?.schema === 'hermeter.ingest.v1'
      ? parseIngestPayload(value)
      : value?.schema === 'hermeter.heartbeat.v1'
        ? parseHeartbeat(value)
        : parseSnapshot(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid payload';
    return json({ error: message }, { status: 400 });
  }

  try {
    if (payload.schema === 'hermeter.ingest.v1') {
      const db = platform?.env.DB;
      if (!db) {
        return json({ error: 'database unavailable' }, { status: 503 });
      }
      const result = await applyIngest(db, payload);
      return json({ ok: true, ...result, checkedThroughMs: payload.checkedThroughMs });
    }
    const snapshots = platform?.env.SNAPSHOTS;
    if (!snapshots) {
      return json({ error: 'snapshot store unavailable' }, { status: 503 });
    }
    const database = platform?.env.DB;
    if (!database) {
      return json({ error: 'snapshot authority unavailable' }, { status: 503 });
    }
    const authority = new CasSnapshotAuthority(
      new D1SnapshotAuthorityPersistence(database)
    );
    if (payload.schema === 'hermeter.heartbeat.v1') {
      await saveOrderedHeartbeat(authority, snapshots, payload);
      return json({
        ok: true,
        kind: 'heartbeat',
        dataRevision: payload.dataRevision,
        checkedThroughMs: payload.checkedThroughMs
      });
    }

    await saveOrderedSnapshot(authority, snapshots, payload);
    return json({
      ok: true,
      kind: 'snapshot',
      acceptedBuckets: payload.buckets.length,
      dataRevision: payload.dataRevision,
      checkedThroughMs: payload.checkedThroughMs
    });
  } catch (error) {
    if (error instanceof StaleSnapshotError) {
      return json({ error: 'stale or conflicting payload' }, { status: 409 });
    }
    return json({ error: 'ingest temporarily unavailable' }, { status: 503 });
  }
};
