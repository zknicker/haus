import { expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAttachmentStore } from './attachment-store.ts';
import { normalizeHttpOrigin } from './haus-origin.ts';
import { ensureComputerLoginSession, readComputerLoginSession } from './login.ts';

test('validates HTTP origins without rewriting custom servers', () => {
    expect(normalizeHttpOrigin('https://haus.chat/path')).toBe('https://haus.chat');
    expect(normalizeHttpOrigin('http://localhost:1234/path')).toBe('http://localhost:1234');
    expect(() => normalizeHttpOrigin('file:///tmp/app')).toThrow('HTTP(S)');
});

test('attachment lookups preserve server origins and credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-attachment-migration-'));
    const directory = join(root, 'servers', 'srv_test');
    const attachment = {
        computerId: 'cmp_test',
        credential: 'unchanged-attachment-credential',
        serverId: 'srv_test',
        serverOrigin: 'https://haus.chat',
        slug: 'test',
    };
    try {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'attachment.json'), JSON.stringify(attachment));
        const store = createAttachmentStore(root);
        const expected = { ...attachment, serverOrigin: 'https://haus.chat' };
        expect(await store.readAttachment('srv_test')).toEqual(expected);
        expect(await store.findAttachment('test')).toEqual(expected);
        expect(await store.listAttachments()).toEqual([expected]);
        expect(await store.readAttachment('../outside')).toBeNull();
        expect(JSON.parse(await readFile(join(directory, 'attachment.json'), 'utf8'))).toEqual(
            attachment
        );
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

test('login refresh sends credentials directly to its saved Haus origin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-login-migration-'));
    const stored = {
        accessToken: `gcl_at_${'a'.repeat(43)}`,
        accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        origin: 'https://haus.chat',
        refreshToken: `gcl_rt_${'b'.repeat(43)}`,
        refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        sessionId: 'cls_1234567890123456',
    };
    const request = (input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
        expect(String(input)).toBe('https://haus.chat/computer/login/refresh');
        expect(options?.redirect).toBe('error');
        return Promise.resolve(
            Response.json({
                ...stored,
                accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                status: 'refreshed',
            })
        );
    };
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        Object.assign(request, { preconnect: globalThis.fetch.preconnect })
    );
    try {
        await writeFile(join(root, 'login.json'), JSON.stringify(stored));
        const session = await readComputerLoginSession(root);
        expect(session?.origin).toBe('https://haus.chat');
        if (!session) {
            throw new Error('Expected the saved login session.');
        }
        const refreshed = await ensureComputerLoginSession({ dataRoot: root, session });
        expect(refreshed.origin).toBe('https://haus.chat');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(await readFile(join(root, 'login.json'), 'utf8')).origin).toBe(
            'https://haus.chat'
        );
    } finally {
        fetchSpy.mockRestore();
        await rm(root, { force: true, recursive: true });
    }
});
