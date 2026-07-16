export async function fetchStatusRevision(fetcher: typeof fetch = fetch): Promise<number | null> {
  try {
    const response = await fetcher('/api/status');
    if (!response.ok) return null;
    const payload = await response.json() as { dataRevision?: unknown };
    return typeof payload.dataRevision === 'number' && Number.isFinite(payload.dataRevision)
      ? payload.dataRevision
      : null;
  } catch {
    return null;
  }
}
