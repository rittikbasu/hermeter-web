function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export async function fetchStatusVersion(
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  try {
    const response = await fetcher('/api/status');
    if (!response.ok) return null;
    const payload = await response.json() as {
      dataRevision?: unknown;
      checkedThroughMs?: unknown;
    };
    if (
      !nonNegativeInteger(payload.dataRevision)
      || !nonNegativeInteger(payload.checkedThroughMs)
    ) return null;
    return `${payload.dataRevision}:${payload.checkedThroughMs}`;
  } catch {
    return null;
  }
}
