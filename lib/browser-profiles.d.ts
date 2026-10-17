export function candidateProfileDirs(browser: string, homedir?: string, platform?: NodeJS.Platform): string[];
export function hasBrowserProfile(browser: string, homedir?: string, platform?: NodeJS.Platform): boolean;
export function readKeyPrefix(browser: string, homedir?: string, platform?: NodeJS.Platform): string;
export function resolveCookieProfile(browser: string, homedir?: string, platform?: NodeJS.Platform): { userDataDir: string; profile: string } | null;
export function resolveFirefoxProfile(homedir?: string, platform?: NodeJS.Platform): { directory: string; cookieDb: string; profile: string } | null;
export function hasNodeSqlite(): boolean;
