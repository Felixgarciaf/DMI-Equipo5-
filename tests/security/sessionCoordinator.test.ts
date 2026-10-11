import { coordinateSessionRefresh } from "../../src/security/sessionCoordinator";

test("coalesces simultaneous 401 responses into one refresh", () => {
  expect(
    coordinateSessionRefresh([
      { type: "request401", requestId: "a", generation: 0 },
      { type: "request401", requestId: "b", generation: 0 },
      { type: "request401", requestId: "c", generation: 0 },
      { type: "refreshSucceeded", generation: 1, token: "course-token-1" },
    ]),
  ).toEqual({
    status: "authenticated",
    activeGeneration: 1,
    refreshCalls: 1,
    retriedRequestIds: ["a", "b", "c"],
    persistedToken: "course-token-1",
  });
});

test("moves to anonymous state when refresh fails", () => {
  expect(
    coordinateSessionRefresh([
      { type: "request401", requestId: "a", generation: 0 },
      { type: "request401", requestId: "b", generation: 0 },
      { type: "refreshFailed", generation: 0 },
      { type: "request401", requestId: "c", generation: 0 },
    ]),
  ).toEqual({
    status: "anonymous",
    activeGeneration: null,
    refreshCalls: 1,
    retriedRequestIds: [],
    persistedToken: null,
  });
});

test("ignores stale 401 responses after a newer generation is active", () => {
  expect(
    coordinateSessionRefresh([
      { type: "request401", requestId: "a", generation: 0 },
      { type: "refreshSucceeded", generation: 1, token: "course-token-1" },
      { type: "request401", requestId: "old-a", generation: 0 },
    ]),
  ).toEqual({
    status: "authenticated",
    activeGeneration: 1,
    refreshCalls: 1,
    retriedRequestIds: ["a"],
    persistedToken: "course-token-1",
  });
});

test("logout clears persisted token and stops further refresh attempts", () => {
  expect(
    coordinateSessionRefresh([
      { type: "request401", requestId: "a", generation: 0 },
      { type: "logout" },
      { type: "request401", requestId: "b", generation: 0 },
      { type: "refreshSucceeded", generation: 1, token: "course-token-1" },
    ]),
  ).toEqual({
    status: "anonymous",
    activeGeneration: null,
    refreshCalls: 1,
    retriedRequestIds: [],
    persistedToken: null,
  });
});
