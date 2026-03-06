/**
 * Get the origin the client used (e.g. ngrok URL when behind a tunnel).
 * request.url is often http://localhost:3000 when proxied, so redirects would send users to localhost.
 */
export function getRequestOrigin(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");

  if (forwardedHost) {
    const proto = forwardedProto === "https" ? "https" : "http";
    return `${proto}://${forwardedHost}`;
  }

  if (host) {
    const proto = host.startsWith("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}
