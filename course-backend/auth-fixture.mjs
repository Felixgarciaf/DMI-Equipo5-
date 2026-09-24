const accessTokens = new Map([
  ['course-access-reporter-1', 'reporter-1'],
  ['course-access-reporter-2', 'reporter-2'],
  ['course-access-technician-1', 'technician-1'],
  ['course-access-technician-2', 'technician-2'],
  ['course-access-coordinator-1', 'coordinator-1'],
]);

const refreshTokens = new Map([
  ['course-refresh-reporter-1', 'reporter-1'],
  ['course-refresh-reporter-2', 'reporter-2'],
  ['course-refresh-technician-1', 'technician-1'],
  ['course-refresh-technician-2', 'technician-2'],
  ['course-refresh-coordinator-1', 'coordinator-1'],
]);

export function accessTokenFor(actorId) {
  for (const [token, owner] of accessTokens) {
    if (owner === actorId) return token;
  }
  return null;
}

export function actorFromAccessToken(token) {
  return accessTokens.get(token) ?? null;
}

export function refreshTokenFor(actorId) {
  for (const [token, owner] of refreshTokens) {
    if (owner === actorId) return token;
  }
  return null;
}

export function actorFromRefreshToken(token) {
  return refreshTokens.get(token) ?? null;
}