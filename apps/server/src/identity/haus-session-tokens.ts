import { createHash } from 'node:crypto';

export function hashHausToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

export function isHausToken(token: string) {
    return /^[A-Za-z0-9_-]{43}$/u.test(token);
}
