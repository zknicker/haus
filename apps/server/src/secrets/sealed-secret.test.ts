import { describe, expect, test } from 'bun:test';
import {
    openSecret,
    parseSecretsKey,
    SealedSecretUnreadableError,
    SecretsKeyMissingError,
    sealSecret,
} from './sealed-secret.ts';

const key = parseSecretsKey(Buffer.alloc(32, 7).toString('base64'));
const otherKey = parseSecretsKey(Buffer.alloc(32, 9).toString('base64'));

describe('sealed secrets', () => {
    test('a sealed value opens to the same plaintext and never carries it', () => {
        const sealed = sealSecret(key, '{"kind":"api-key","key":"xai-secret-value"}');

        expect(sealed.v).toBe(1);
        expect(sealed.kid).toBe(key.kid);
        expect(JSON.stringify(sealed)).not.toContain('xai-secret-value');
        expect(openSecret(key, sealed)).toBe('{"kind":"api-key","key":"xai-secret-value"}');
    });

    test('the key id is the first 8 hex of the key digest', () => {
        expect(key.kid).toBe(
            new Bun.CryptoHasher('sha256').update(key.key).digest('hex').slice(0, 8)
        );
        expect(otherKey.kid).not.toBe(key.kid);
    });

    test('a tampered tag or ciphertext is refused', () => {
        const sealed = sealSecret(key, 'setup-token-value');
        const flipped = Buffer.from(sealed.tag, 'base64');
        flipped[0] = (flipped[0] ?? 0) ^ 1;

        expect(() => openSecret(key, { ...sealed, tag: flipped.toString('base64') })).toThrow(
            new SealedSecretUnreadableError('authentication failed')
        );
        expect(() =>
            openSecret(key, { ...sealed, ct: Buffer.from('other bytes').toString('base64') })
        ).toThrow(SealedSecretUnreadableError);
    });

    test('another key cannot open it', () => {
        const sealed = sealSecret(key, 'setup-token-value');

        expect(() => openSecret(otherKey, sealed)).toThrow(
            new SealedSecretUnreadableError(`sealed under key ${key.kid}`)
        );
        expect(() => openSecret(otherKey, { ...sealed, kid: otherKey.kid })).toThrow(
            new SealedSecretUnreadableError('authentication failed')
        );
    });

    test('an unknown envelope version is refused', () => {
        const sealed = sealSecret(key, 'setup-token-value');

        expect(() => openSecret(key, { ...sealed, v: 2 })).toThrow(
            new SealedSecretUnreadableError('unknown envelope version or shape')
        );
    });

    test('without a key nothing seals or opens', () => {
        expect(() => sealSecret(null, 'value')).toThrow(SecretsKeyMissingError);
        expect(() => openSecret(null, sealSecret(key, 'value'))).toThrow(SecretsKeyMissingError);
    });

    test('a key that is not 32 bytes of base64 is rejected', () => {
        expect(() => parseSecretsKey(Buffer.alloc(16).toString('base64'))).toThrow(
            'HAUS_SECRETS_KEY must be the base64 of exactly 32 bytes.'
        );
        expect(() => parseSecretsKey('not base64!')).toThrow(
            'HAUS_SECRETS_KEY must be the base64 of exactly 32 bytes.'
        );
    });
});
