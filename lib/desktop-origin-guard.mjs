const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isDesktopRequestAllowed({ origin, requestOrigin, requestHost, method, fetchSite }) {
  const isWrite = !SAFE_METHODS.has(String(method).toUpperCase());
  let matchesRequest = origin === requestOrigin;

  // Next can reconstruct requestOrigin from forwarded URL metadata that does
  // not match the authority the browser actually addressed. For the Electron
  // loopback server, the Host header is the authoritative request authority.
  // Require the Origin's scheme and host to match it before accepting this
  // narrowly scoped fallback; never trust arbitrary forwarded-host headers.
  if (!matchesRequest && origin && requestHost) {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(requestOrigin);
      matchesRequest =
        originUrl.protocol === requestUrl.protocol &&
        originUrl.host.toLowerCase() === requestHost.toLowerCase();
    } catch {
      matchesRequest = false;
    }
  }

  if (origin && !matchesRequest) return false;
  if (isWrite && (!matchesRequest || fetchSite === "cross-site")) return false;
  return true;
}
