export function candidateProfileDirs(
  browser: string,
  homedir?: string,
  platform?: NodeJS.Platform | string
): string[];
export function hasBrowserProfile(
  browser: string,
  homedir?: string,
  platform?: NodeJS.Platform | string
): boolean;
export function readKeyPrefix(
  browser: string,
  homedir?: string,
  platform?: NodeJS.Platform | string
): "dpapi" | "app-bound" | "missing";
export function resolveCookieProfile(
  browser: string,
  homedir?: string,
  platform?: NodeJS.Platform | string
): { userDataDir: string; profile: string } | null;
