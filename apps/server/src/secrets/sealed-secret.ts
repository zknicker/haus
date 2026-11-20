import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import * as z from 'zod';

const algorithm = 'aes-256-gcm';
const keyBytes = 32;
const ivBytes = 12;
const tagBytes = 16;

export interface SecretsKey {
    readonly key: Buffer;
    readonly kid: string;
}

const base64Schema = z.base64().min(1);

export const sealedSecretSchema = z
    .object({
        ct: base64Schema,
        iv: base64Schema,
        kid: z.string().regex(/^[0-9a-f]{8}$/u),
        tag: base64Schema,
        v: z.literal(1),
    })
    .strict();
export type SealedSecret = z.infer<typeof sealedSecretSchema>;

export class SecretsKeyMissingError extends Error {
    constructor() {
        super('This Server has no HAUS_SECRETS_KEY, so it cannot store model connections.');
        this.name = 'SecretsKeyMissingError';
    }
}

export class SealedSecretUnreadableError extends Error {
    constructor(reason: string) {
        super(`A sealed secret could not be opened: ${reason}.`);
        this.name = 'SealedSecretUnreadableError';
    }
}

export function parseSecretsKey(encoded: string) {
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== keyBytes || key.toString('base64') !== encoded.trim()) {
        throw new Error(`HAUS_SECRETS_KEY must be the base64 of exactly ${keyBytes} bytes.`);
    }
    const secretsKey: SecretsKey = {
        key,
        kid: createHash('sha256').update(key).digest('hex').slice(0, 8),
    };
    return secretsKey;
}

export function sealSecret(secretsKey: SecretsKey | null, plaintext: string) {
    if (!secretsKey) {
        throw new SecretsKeyMissingError();
    }
    const iv = randomBytes(ivBytes);
    const cipher = createCipheriv(algorithm, secretsKey.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const sealed: SealedSecret = {
        ct: ct.toString('base64'),
        iv: iv.toString('base64'),
        kid: secretsKey.kid,
        tag: cipher.getAuthTag().toString('base64'),
        v: 1,
    };
    return sealed;
}

export function openSecret(secretsKey: SecretsKey | null, envelope: unknown) {
    if (!secretsKey) {
        throw new SecretsKeyMissingError();
    }
    const parsed = sealedSecretSchema.safeParse(envelope);
    if (!parsed.success) {
        throw new SealedSecretUnreadableError('unknown envelope version or shape');
    }
    const sealed = parsed.data;
    if (sealed.kid !== secretsKey.kid) {
        throw new SealedSecretUnreadableError(`sealed under key ${sealed.kid}`);
    }
    const iv = Buffer.from(sealed.iv, 'base64');
    const tag = Buffer.from(sealed.tag, 'base64');
    if (iv.length !== ivBytes || tag.length !== tagBytes) {
        throw new SealedSecretUnreadableError('malformed nonce or tag');
    }
    const decipher = createDecipheriv(algorithm, secretsKey.key, iv);
    decipher.setAuthTag(tag);
    try {
        return Buffer.concat([
            decipher.update(Buffer.from(sealed.ct, 'base64')),
            decipher.final(),
        ]).toString('utf8');
    } catch {
        throw new SealedSecretUnreadableError('authentication failed');
    }
}
