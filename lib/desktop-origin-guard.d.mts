export function isDesktopRequestAllowed(options: {
  origin: string | null;
  requestOrigin: string;
  requestHost?: string | null;
  method: string;
  fetchSite: string | null;
}): boolean;
