export function encodeCredentials(credentials: { ct0: string; authToken: string }): string;
export function decodeCredentials(value: string): { ct0: string; authToken: string } | null;
