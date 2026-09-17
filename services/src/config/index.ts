export const VERSION = 'v1';
export type CachedKey = {
    usedId: string;
    apiKeyDigest: string;
    expiresAt: number;
}
export const LAST_USED_HASH = `ulog:api_key:last_used:${VERSION}`;