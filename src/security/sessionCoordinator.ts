export type SessionRefreshEvent = Readonly<{
  type: "request401" | "refreshSucceeded" | "refreshFailed" | "logout";
  requestId?: string;
  generation?: number;
  token?: string;
}>;

export type SessionRefreshSummary = Readonly<{
  status: "anonymous" | "authenticated";
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}>;

const INITIAL_GENERATION = 0;
const INITIAL_TOKEN = "course-token-0";

function validGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function coordinateSessionRefresh(
  events: readonly SessionRefreshEvent[],
): SessionRefreshSummary {
  let status: "anonymous" | "authenticated" = "authenticated";
  let activeGeneration: number | null = INITIAL_GENERATION;
  let refreshInFlightGeneration: number | null = null;
  let persistedToken: string | null = INITIAL_TOKEN;
  let refreshCalls = 0;

  const pendingRequestIds: string[] = [];
  const pendingRequests = new Set<string>();
  const retriedRequests = new Set<string>();
  const retriedRequestIds: string[] = [];

  for (const event of events) {
    if (event.type === "logout") {
      status = "anonymous";
      activeGeneration = null;
      refreshInFlightGeneration = null;
      persistedToken = null;
      pendingRequestIds.length = 0;
      pendingRequests.clear();
      continue;
    }

    if (event.type === "request401") {
      if (status === "anonymous" || activeGeneration === null) continue;
      if (!validString(event.requestId)) continue;

      const generation = validGeneration(event.generation)
        ? event.generation
        : activeGeneration;
      if (generation < activeGeneration) continue;
      if (retriedRequests.has(event.requestId)) continue;

      if (!pendingRequests.has(event.requestId)) {
        pendingRequests.add(event.requestId);
        pendingRequestIds.push(event.requestId);
      }

      if (refreshInFlightGeneration === null) {
        refreshInFlightGeneration = generation;
        refreshCalls += 1;
      }
      continue;
    }

    if (event.type === "refreshFailed") {
      status = "anonymous";
      activeGeneration = null;
      refreshInFlightGeneration = null;
      persistedToken = null;
      pendingRequestIds.length = 0;
      pendingRequests.clear();
      continue;
    }

    if (refreshInFlightGeneration === null) continue;

    const nextGeneration = validGeneration(event.generation)
      ? event.generation
      : (activeGeneration ?? INITIAL_GENERATION) + 1;
    const nextToken = validString(event.token)
      ? event.token
      : `course-token-${nextGeneration}`;

    if (activeGeneration === null || nextGeneration > activeGeneration) {
      status = "authenticated";
      activeGeneration = nextGeneration;
      persistedToken = nextToken;

      for (const requestId of pendingRequestIds) {
        if (!retriedRequests.has(requestId)) {
          retriedRequests.add(requestId);
          retriedRequestIds.push(requestId);
        }
      }
    }

    refreshInFlightGeneration = null;
    pendingRequestIds.length = 0;
    pendingRequests.clear();
  }

  return {
    status,
    activeGeneration,
    refreshCalls,
    retriedRequestIds,
    persistedToken,
  };
}
