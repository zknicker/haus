import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveClaudeCredentials } from './claude-credentials.ts';

const roots: string[] = [];
const now = 1_800_000_000_000;

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function hostHome(store?: unknown) {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-credentials-'));
    roots.push(root);
    if (store !== undefined) {
        await mkdir(join(root, '.claude'), { recursive: true });
        await writeFile(join(root, '.claude', '.credentials.json'), JSON.stringify(store));
    }
    return root;
}

const oauth = (expiresAt: number) => ({
    claudeAiOauth: { accessToken: 'access-1', expiresAt, refreshToken: 'refresh-1', scopes: ['x'] },
    other: true,
});

test('an explicit Anthropic credential in the Computer env wins over the host login', async () => {
    const credentials = await resolveClaudeCredentials({
        env: { ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'https://proxy.example' },
        hostHomeDir: await hostHome(oauth(now + 3_600_000)),
    });
    expect(credentials).toEqual({
        ANTHROPIC_API_KEY: 'sk-test',
        ANTHROPIC_BASE_URL: 'https://proxy.example',
    });
});

test('the host subscription login rides the env as an OAuth token', async () => {
    const credentials = await resolveClaudeCredentials({
        env: {},
        hostHomeDir: await hostHome(oauth(now + 3_600_000)),
        now: () => now,
        platform: 'linux',
    });
    expect(credentials).toEqual({
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        CLAUDE_CODE_OAUTH_TOKEN: 'access-1',
    });
});

test('an expiring login is refreshed and written back owner-only', async () => {
    const home = await hostHome(oauth(now + 60_000));
    const requests: unknown[] = [];
    const credentials = await resolveClaudeCredentials({
        env: {},
        fetch: (async (_url: string, init: RequestInit) => {
            requests.push(JSON.parse(String(init.body)));
            return Response.json({
                access_token: 'access-2',
                expires_in: 3600,
                refresh_token: 'refresh-2',
            });
        }) as unknown as typeof fetch,
        hostHomeDir: home,
        now: () => now,
        platform: 'linux',
    });
    expect(credentials.CLAUDE_CODE_OAUTH_TOKEN).toBe('access-2');
    expect(requests).toEqual([
        { client_id: expect.any(String), grant_type: 'refresh_token', refresh_token: 'refresh-1' },
    ]);
    const path = join(home, '.claude', '.credentials.json');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
        claudeAiOauth: {
            accessToken: 'access-2',
            expiresAt: now + 3_600_000,
            refreshToken: 'refresh-2',
            scopes: ['x'],
        },
        other: true,
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
});

test('a failed refresh fails the open instead of launching with a dead token', async () => {
    const attempt = resolveClaudeCredentials({
        env: {},
        fetch: (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch,
        hostHomeDir: await hostHome(oauth(now)),
        now: () => now,
        platform: 'linux',
    });
    await expect(attempt).rejects.toThrow('status 400');
});

test('macOS reads the keychain login when no credentials file exists', async () => {
    const written: string[] = [];
    const credentials = await resolveClaudeCredentials({
        env: { USER: 'operator' },
        fetch: (async () =>
            Response.json({ access_token: 'access-3', expires_in: 60 })) as unknown as typeof fetch,
        hostHomeDir: await hostHome(),
        now: () => now,
        platform: 'darwin',
        readKeychain: () => Promise.resolve(JSON.stringify(oauth(now))),
        writeKeychain: (value) => {
            written.push(value);
            return Promise.resolve();
        },
    });
    expect(credentials.CLAUDE_CODE_OAUTH_TOKEN).toBe('access-3');
    expect(JSON.parse(written[0] ?? '{}').claudeAiOauth.refreshToken).toBe('refresh-1');
});

test('no login anywhere launches with no credential, leaving the CLI to report it', async () => {
    expect(
        await resolveClaudeCredentials({
            env: { CLAUDE_CONFIG_DIR: '/custom/claude' },
            hostHomeDir: await hostHome(),
            platform: 'darwin',
            readKeychain: () => Promise.reject(new Error('keychain must not be read')),
        })
    ).toEqual({});
});
