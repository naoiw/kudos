/** Route-chunk validation is independent of React and safe to exercise with fake HTTP. */
export interface RouteChunkEntry {
  run_id: number;
  route_segments: string[];
}

interface RouteChunkDocument {
  schema_version: number;
  routes: RouteChunkEntry[];
}

type ChunkFetch = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Throws on missing, unsafe, corrupted or repeated published route chunks. */
export async function loadRouteChunks(
  paths: string[],
  baseUrl: string,
  request: ChunkFetch = fetch
): Promise<Map<number, string[]>> {
  const collected = new Map<number, string[]>();
  // Limit concurrent downloads rather than flooding the static host.
  for (let start = 0; start < paths.length; start += 6) {
    const group = await Promise.all(paths.slice(start, start + 6).map(async path => {
      if (!/^data\/exports\/[a-z0-9]{16,48}\/chunk-\d{4}\.json$/.test(path)) {
        throw new Error('Invalid route chunk path in preview manifest');
      }
      const response = await request(baseUrl + path);
      if (!response.ok) {
        throw new Error('Route chunk could not be fetched: ' + path + ' (' + response.status + ')');
      }
      const candidate = await response.json() as RouteChunkDocument;
      if (!candidate || candidate.schema_version !== 1 ||
          !Array.isArray(candidate.routes)) {
        throw new Error('Invalid route chunk format: ' + path);
      }
      return candidate.routes;
    }));
    for (const routes of group) {
      for (const route of routes) {
        if (!route || !Number.isSafeInteger(route.run_id) ||
            collected.has(route.run_id) ||
            !Array.isArray(route.route_segments) ||
            route.route_segments.length === 0 ||
            !route.route_segments.every(segment => typeof segment === 'string')) {
          throw new Error('Invalid or duplicated encoded route entry in preview');
        }
        collected.set(route.run_id, route.route_segments);
      }
    }
  }
  return collected;
}
