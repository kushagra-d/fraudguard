// Reads a JWT's payload for display purposes only (email/role in the header, etc.)
// This performs NO signature verification - it cannot and does not vouch for the
// token's validity. The server is the sole source of truth on whether a token is
// genuine; every protected request still gets checked there. Never use this
// function's output to make an authorization decision on the client.
export function decodeJwt(token) {
  const payload = token.split('.')[1];
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json);
}
