import {
  MAX_TIMESTAMP_MS,
  parseSnapshot,
  snapshotMetadata,
  type DashboardSnapshot,
  type SnapshotHeartbeat,
  type SnapshotMetadata
} from './snapshot';
import {
  loadSnapshot,
  loadSnapshotMetadata
} from './snapshot-store';

export class StaleSnapshotError extends Error {}
export class AuthoritativeSnapshotUnavailableError extends Error {}

export const VERSIONED_SNAPSHOT_PREFIX = 'hermeter:snapshot:v2:';
const VERSIONED_SNAPSHOT_TTL_SECONDS = 30 * 24 * 60 * 60;

export type SnapshotAuthorityState = {
  snapshotKey: string;
  contentHash: string;
  dataRevision: number;
  generatedAtMs: number;
  coveredFromMs: number;
  checkedThroughMs: number;
};

export interface SnapshotAuthorityPersistence {
  read(): Promise<SnapshotAuthorityState | null>;
  compareAndSwap(
    expected: SnapshotAuthorityState | null,
    replacement: SnapshotAuthorityState
  ): Promise<boolean>;
}

export interface SnapshotAuthority {
  acceptSnapshot(candidate: SnapshotAuthorityState): Promise<SnapshotAuthorityState>;
  acceptHeartbeat(heartbeat: SnapshotHeartbeat): Promise<SnapshotAuthorityState>;
  latest(): Promise<SnapshotAuthorityState>;
}

function analyticalContent(snapshot: DashboardSnapshot): string {
  return JSON.stringify({
    coveredFromMs: snapshot.coveredFromMs,
    sessions: snapshot.sessions,
    buckets: snapshot.buckets
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function versionedSnapshotKey(dataRevision: number, contentHash: string, nonce = 'content'): string {
  return `${VERSIONED_SNAPSHOT_PREFIX}${dataRevision}:${contentHash}:${nonce}`;
}

function matchesVersionedSnapshotKey(
  key: string,
  dataRevision: number,
  contentHash: string
): boolean {
  const prefix = versionedSnapshotKey(dataRevision, contentHash, '');
  const nonce = key.startsWith(prefix) ? key.slice(prefix.length) : '';
  return /^[A-Za-z0-9-]{1,64}$/.test(nonce);
}

export async function snapshotAuthorityState(
  snapshot: DashboardSnapshot,
  nonce?: string
): Promise<SnapshotAuthorityState> {
  const contentHash = await sha256(analyticalContent(snapshot));
  return {
    snapshotKey: versionedSnapshotKey(snapshot.dataRevision, contentHash, nonce),
    contentHash,
    dataRevision: snapshot.dataRevision,
    generatedAtMs: snapshot.generatedAtMs,
    coveredFromMs: snapshot.coveredFromMs,
    checkedThroughMs: snapshot.checkedThroughMs
  };
}

export function advanceSnapshotState(
  current: SnapshotAuthorityState | null,
  incoming: SnapshotAuthorityState
): SnapshotAuthorityState {
  if (!current) return incoming;
  if (incoming.dataRevision < current.dataRevision) {
    throw new StaleSnapshotError('snapshot revision regressed');
  }
  if (
    incoming.generatedAtMs < current.generatedAtMs
    || incoming.checkedThroughMs < current.checkedThroughMs
    || incoming.coveredFromMs > current.coveredFromMs
    || (
      incoming.generatedAtMs === current.generatedAtMs
      && incoming.dataRevision !== current.dataRevision
    )
    || (
      incoming.dataRevision === current.dataRevision
      && (
        incoming.coveredFromMs !== current.coveredFromMs
        || incoming.contentHash !== current.contentHash
      )
    )
  ) {
    throw new StaleSnapshotError('snapshot regresses or conflicts with authoritative state');
  }
  return incoming;
}

export function advanceHeartbeatState(
  current: SnapshotAuthorityState | null,
  heartbeat: SnapshotHeartbeat
): SnapshotAuthorityState {
  if (
    !current
    || heartbeat.dataRevision !== current.dataRevision
    || heartbeat.generatedAtMs < current.generatedAtMs
    || heartbeat.checkedThroughMs < current.checkedThroughMs
  ) {
    throw new StaleSnapshotError('heartbeat does not advance authoritative state');
  }
  return {
    ...current,
    generatedAtMs: heartbeat.generatedAtMs,
    checkedThroughMs: heartbeat.checkedThroughMs
  };
}

type AuthorityRow = {
  snapshot_key: string;
  content_hash: string;
  data_revision: number;
  generated_at_ms: number;
  covered_from_ms: number;
  checked_through_ms: number;
};

function validInteger(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function stateFromRow(row: AuthorityRow): SnapshotAuthorityState {
  const state = {
    snapshotKey: row.snapshot_key,
    contentHash: row.content_hash,
    dataRevision: row.data_revision,
    generatedAtMs: row.generated_at_ms,
    coveredFromMs: row.covered_from_ms,
    checkedThroughMs: row.checked_through_ms
  };
  if (
    !/^[0-9a-f]{64}$/.test(state.contentHash)
    || !validInteger(state.dataRevision, Number.MAX_SAFE_INTEGER)
    || !validInteger(state.generatedAtMs, MAX_TIMESTAMP_MS)
    || !validInteger(state.coveredFromMs, MAX_TIMESTAMP_MS)
    || !validInteger(state.checkedThroughMs, MAX_TIMESTAMP_MS)
    || state.coveredFromMs > state.checkedThroughMs
    || state.checkedThroughMs > state.generatedAtMs
    || !matchesVersionedSnapshotKey(state.snapshotKey, state.dataRevision, state.contentHash)
  ) throw new Error('snapshot authority row is corrupt');
  return state;
}

function stateBindings(state: SnapshotAuthorityState): unknown[] {
  return [
    state.snapshotKey,
    state.contentHash,
    state.dataRevision,
    state.generatedAtMs,
    state.coveredFromMs,
    state.checkedThroughMs
  ];
}

export class D1SnapshotAuthorityPersistence implements SnapshotAuthorityPersistence {
  constructor(private database: D1Database) {}

  async read(): Promise<SnapshotAuthorityState | null> {
    const row = await this.database.prepare(`
      SELECT snapshot_key, content_hash, data_revision, generated_at_ms,
             covered_from_ms, checked_through_ms
      FROM snapshot_authority WHERE id = 1
    `).first<AuthorityRow>();
    return row ? stateFromRow(row) : null;
  }

  async compareAndSwap(
    expected: SnapshotAuthorityState | null,
    replacement: SnapshotAuthorityState
  ): Promise<boolean> {
    const replacementBindings = stateBindings(replacement);
    const statement = expected === null
      ? this.database.prepare(`
          INSERT INTO snapshot_authority (
            id, snapshot_key, content_hash, data_revision, generated_at_ms,
            covered_from_ms, checked_through_ms
          ) VALUES (1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `).bind(...replacementBindings)
      : this.database.prepare(`
          UPDATE snapshot_authority
          SET snapshot_key = ?, content_hash = ?, data_revision = ?,
              generated_at_ms = ?, covered_from_ms = ?, checked_through_ms = ?
          WHERE id = 1
            AND snapshot_key = ? AND content_hash = ? AND data_revision = ?
            AND generated_at_ms = ? AND covered_from_ms = ? AND checked_through_ms = ?
        `).bind(...replacementBindings, ...stateBindings(expected));
    const result = await statement.run();
    return result.meta.changes === 1;
  }
}

export class CasSnapshotAuthority implements SnapshotAuthority {
  constructor(private persistence: SnapshotAuthorityPersistence) {}

  async acceptSnapshot(candidate: SnapshotAuthorityState): Promise<SnapshotAuthorityState> {
    return this.update((current) => advanceSnapshotState(current, candidate));
  }

  async acceptHeartbeat(heartbeat: SnapshotHeartbeat): Promise<SnapshotAuthorityState> {
    return this.update((current) => advanceHeartbeatState(current, heartbeat));
  }

  async latest(): Promise<SnapshotAuthorityState> {
    const current = await this.persistence.read();
    if (!current) throw new Error('snapshot authority is unavailable');
    return current;
  }

  private async update(
    advance: (current: SnapshotAuthorityState | null) => SnapshotAuthorityState
  ): Promise<SnapshotAuthorityState> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.persistence.read();
      const replacement = advance(current);
      if (await this.persistence.compareAndSwap(current, replacement)) return replacement;
    }
    throw new Error('snapshot authority remained contended');
  }
}

export async function loadVerifiedSnapshot(
  persistence: SnapshotAuthorityPersistence,
  kv: KVNamespace
): Promise<DashboardSnapshot> {
  const authoritative = await persistence.read();
  if (!authoritative) return loadSnapshot(kv);
  return loadAuthoritativeSnapshot(authoritative, kv);
}

async function loadAuthoritativeSnapshot(
  authoritative: SnapshotAuthorityState,
  kv: KVNamespace
): Promise<DashboardSnapshot> {
  const value = await kv.get(authoritative.snapshotKey);
  if (value === null) {
    throw new AuthoritativeSnapshotUnavailableError('authoritative snapshot is unavailable');
  }
  const stored = parseSnapshot(JSON.parse(value));
  const storedState = await snapshotAuthorityState(stored);
  if (
    storedState.contentHash !== authoritative.contentHash
    || storedState.dataRevision !== authoritative.dataRevision
    || storedState.coveredFromMs !== authoritative.coveredFromMs
    || !matchesVersionedSnapshotKey(
      authoritative.snapshotKey,
      storedState.dataRevision,
      storedState.contentHash
    )
    || storedState.generatedAtMs > authoritative.generatedAtMs
    || storedState.checkedThroughMs > authoritative.checkedThroughMs
  ) throw new Error('authoritative snapshot content does not match D1');
  return {
    ...stored,
    generatedAtMs: authoritative.generatedAtMs,
    checkedThroughMs: authoritative.checkedThroughMs
  };
}

export async function loadVerifiedSnapshotMetadata(
  persistence: SnapshotAuthorityPersistence,
  kv: KVNamespace
): Promise<SnapshotMetadata> {
  const authoritative = await persistence.read();
  if (!authoritative) return loadSnapshotMetadata(kv);
  return snapshotMetadata(await loadAuthoritativeSnapshot(authoritative, kv));
}

type VersionedMetadata = SnapshotMetadata & { contentHash: string };

export async function saveOrderedSnapshot(
  authority: SnapshotAuthority,
  kv: KVNamespace,
  snapshot: DashboardSnapshot
): Promise<void> {
  const candidate = await snapshotAuthorityState(snapshot, crypto.randomUUID());
  await kv.put(candidate.snapshotKey, JSON.stringify(snapshot), {
    expirationTtl: VERSIONED_SNAPSHOT_TTL_SECONDS,
    metadata: {
      ...snapshotMetadata(snapshot),
      contentHash: candidate.contentHash
    } satisfies VersionedMetadata
  });
  await authority.acceptSnapshot(candidate);
}

export async function saveOrderedHeartbeat(
  authority: SnapshotAuthority,
  kv: KVNamespace,
  heartbeat: SnapshotHeartbeat
): Promise<void> {
  const current = await authority.latest();
  advanceHeartbeatState(current, heartbeat);
  const snapshot = await loadAuthoritativeSnapshot(current, kv);
  await kv.put(current.snapshotKey, JSON.stringify(snapshot), {
    expirationTtl: VERSIONED_SNAPSHOT_TTL_SECONDS,
    metadata: {
      ...snapshotMetadata(snapshot),
      contentHash: current.contentHash
    } satisfies VersionedMetadata
  });
  await authority.acceptHeartbeat(heartbeat);
}
