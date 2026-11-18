import { expect, test } from 'bun:test';
import {
    normalizeStoredComputerReleaseKey,
    readComputerReleasePrivateKey,
    readComputerReleasePublicKey,
} from './computer-release-keys.mjs';

const privateKey = '-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----';
const publicKey = '-----BEGIN PUBLIC KEY-----\npublic\n-----END PUBLIC KEY-----';

test('Computer release keys prefer environment PEM and expand escaped newlines', () => {
    expect(
        readComputerReleasePrivateKey({
            environment: {
                HAUS_COMPUTER_RELEASE_PRIVATE_KEY: privateKey.replaceAll('\n', '\\n'),
            },
            readKeychainPassword: () => {
                throw new Error('Keychain should not be read.');
            },
        })
    ).toBe(privateKey);
});

test('Computer release keys decode the established hex-encoded Keychain values', () => {
    expect(
        readComputerReleasePublicKey({
            environment: {},
            readKeychainPassword: (service) => {
                expect(service).toBe('haus-computer-release-ed25519-public');
                return Buffer.from(publicKey).toString('hex');
            },
        })
    ).toBe(publicKey);
});

test('missing Computer release keys remain missing', () => {
    expect(
        readComputerReleasePrivateKey({
            environment: {},
            readKeychainPassword: () => null,
        })
    ).toBeNull();
    expect(normalizeStoredComputerReleaseKey('')).toBeNull();
});
