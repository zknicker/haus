'use strict';

const { expect, test } = require('bun:test');
const { createNativeAuthStore } = require('./native-auth-store.cjs');

test('native provider and resume credentials are encrypted in the main-process store', () => {
    const files = createMemoryFiles();
    const safeStorage = createSafeStorage();
    const app = { getPath: () => '/haus-user-data' };
    const store = createNativeAuthStore({ app, fs: files.fs, safeStorage });
    const credentials = {
        accessExpiresAt: 1000,
        accessToken: 'provider-access',
        refreshToken: 'provider-refresh',
        sessionToken: 'haus-resume',
    };

    store.write(credentials);

    const saved = files.read('/haus-user-data/app-auth.bin');
    expect(saved.toString()).toMatch(/^encrypted:/u);
    expect(saved.toString()).not.toContain('provider-access');
    expect(saved.toString()).not.toContain('haus-resume');
    expect(createNativeAuthStore({ app, fs: files.fs, safeStorage }).read()).toEqual(credentials);
    store.clear();
    expect(files.read('/haus-user-data/app-auth.bin')).toBeNull();
});

test('native auth fails closed when Electron cannot encrypt credentials', () => {
    const files = createMemoryFiles();
    const store = createNativeAuthStore({
        app: { getPath: () => '/haus-user-data' },
        fs: files.fs,
        safeStorage: createSafeStorage(false),
    });

    expect(() => store.write({ accessToken: 'provider-access' })).toThrow(
        'Haus could not securely store sign-in credentials.'
    );
    expect(files.paths()).toEqual([]);
});

function createSafeStorage(available = true) {
    return {
        decryptString: (value) =>
            Buffer.from(value.toString().slice('encrypted:'.length), 'base64').toString(),
        encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`),
        isEncryptionAvailable: () => available,
    };
}

function createMemoryFiles() {
    const files = new Map();
    return {
        fs: {
            existsSync: (path) => files.has(path),
            readFileSync: (path) => files.get(path),
            renameSync: (from, to) => {
                files.set(to, files.get(from));
                files.delete(from);
            },
            unlinkSync: (path) => files.delete(path),
            writeFileSync: (path, value) => files.set(path, Buffer.from(value)),
        },
        paths: () => [...files.keys()],
        read: (path) => files.get(path) ?? null,
    };
}
