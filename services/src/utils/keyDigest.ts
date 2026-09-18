import crypto from 'crypto';

export function digest(plain: string) {
    const REDIS_KEY_SECRET = process.env.REDIS_KEY_SECRET;

    if (!REDIS_KEY_SECRET) {
        throw new Error('REDIS_KEY_SECRET environment variable is required');
    }
    return crypto
        .createHmac('sha256', REDIS_KEY_SECRET)
        .update(plain)
        .digest('hex');
}