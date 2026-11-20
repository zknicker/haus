import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openFileCredentialStore, piLoginsDir } from './pi-credentials.ts';

const directories: string[] = [];

afterEach(async () => {
    for (const directory of directories.splice(0)) {
        await rm(directory, { force: true, recursive: true });
    }
});

async function loginsDir() {
    const dataDir = await mkdtemp(join(tmpdir(), 'haus-pi-logins-'));
    directories.push(dataDir);
    return piLoginsDir(dataDir);
}

const signedIn = {
    access: 'access-1',
    accountId: 'acct_1',
    expires: 1_800_000_000_000,
    refresh: 'refresh-1',
    type: 'oauth',
} as const;

describe('Pi credential file store', () => {
    test('a sign-in round-trips through one private file per provider', async () => {
        const directory = await loginsDir();
        const store = openFileCredentialStore(directory);

        expect(await store.read('openai-codex')).toBeUndefined();
        expect(await store.modify('openai-codex', async () => signedIn)).toEqual(signedIn);

        expect(await openFileCredentialStore(directory).read('openai-codex')).toEqual(signedIn);
        expect(await store.list()).toEqual([{ providerId: 'openai-codex', type: 'oauth' }]);
        expect(await readdir(directory)).toEqual(['openai-codex.json']);
        expect((await stat(join(directory, 'openai-codex.json'))).mode & 0o777).toBe(0o600);
        expect(JSON.parse(await readFile(join(directory, 'openai-codex.json'), 'utf8'))).toEqual(
            signedIn
        );
    });

    test('concurrent refreshes run one after another, each seeing the last write', async () => {
        const store = openFileCredentialStore(await loginsDir());
        await store.modify('openai-codex', async () => ({ ...signedIn, access: 'access-0' }));
        const rotate = () =>
            store.modify('openai-codex', async (current) =>
                current?.type === 'oauth'
                    ? { ...current, access: `access-${Number(current.access.slice(7)) + 1}` }
                    : undefined
            );

        const rotations = await Promise.all([rotate(), rotate(), rotate()]);

        expect(
            rotations.map((credential) => credential?.type === 'oauth' && credential.access)
        ).toEqual(['access-1', 'access-2', 'access-3']);
    });

    test('a change that returns nothing keeps the file, and delete removes it', async () => {
        const directory = await loginsDir();
        const store = openFileCredentialStore(directory);
        await store.modify('openai-codex', async () => signedIn);

        expect(await store.modify('openai-codex', async () => undefined)).toEqual(signedIn);
        await store.delete('openai-codex');
        await store.delete('openai-codex');

        expect(await store.read('openai-codex')).toBeUndefined();
        expect(await store.list()).toEqual([]);
    });

    test('a file that is not a credential is a storage failure, not a missing sign-in', async () => {
        const directory = await loginsDir();
        const store = openFileCredentialStore(directory);
        await store.modify('openai-codex', async () => signedIn);
        await writeFile(join(directory, 'openai-codex.json'), '{"type":"oauth"}');

        await expect(store.read('openai-codex')).rejects.toThrow(
            'The openai-codex sign-in file is not a credential'
        );
    });
});
