import { afterAll, expect, test } from 'bun:test';
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grokAuthMethod, resolveGrokCredential } from './grok-auth.ts';

const CLIENT = 'b1a00492-073a-47ea-816f-4c329264a828';
const ISSUER = 'https://auth.example.test';
const roots: string[] = [];
afterAll(() => Promise.all(roots.map((root) => rm(root, { force: true, recursive: true }))));

/** An Agent HOME whose `auth.json` links to the operator's, as `prepareGrokHome` leaves it. */
async function linkedLogin(expiresAt: number) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-grok-auth-')));
    roots.push(root);
    const hostAuth = join(root, 'host-auth.json');
    await writeFile(
        hostAuth,
        JSON.stringify({
            [`${ISSUER}::${CLIENT}`]: {
                expires_at: expiresAt,
                key: 'access-1',
                refresh_token: 'refresh-1',
            },
        })
    );
    const grokHome = join(root, 'home', '.grok');
    await mkdir(grokHome, { recursive: true });
    await symlink(hostAuth, join(grokHome, 'auth.json'));
    return { grokHome, hostAuth };
}

test('a valid subscription login becomes an xai.api_key credential against the CLI chat proxy', async () => {
    const { grokHome } = await linkedLogin(Date.now() + 6 * 3_600_000);

    expect(await resolveGrokCredential({ env: {}, grokHome })).toMatchObject({
        env: {
            GROK_CLI_CHAT_PROXY_BASE_URL: 'https://cli-chat-proxy.grok.com/v1',
            GROK_MODELS_BASE_URL: 'https://cli-chat-proxy.grok.com/v1',
            GROK_XAI_API_BASE_URL: 'https://cli-chat-proxy.grok.com/v1',
            XAI_API_KEY: 'access-1',
        },
        kind: 'subscription',
    });
});

test('an expiring login refreshes and writes through the link, keeping the link', async () => {
    const { grokHome, hostAuth } = await linkedLogin(Date.now() + 60_000);
    const requests: string[] = [];
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requests.push(`${init?.method ?? 'GET'} ${String(url)} ${String(init?.body ?? '')}`);
        return String(url).endsWith('openid-configuration')
            ? Response.json({ token_endpoint: `${ISSUER}/token` })
            : Response.json({
                  access_token: 'access-2',
                  expires_in: 3600,
                  refresh_token: 'refresh-2',
              });
    }) as typeof globalThis.fetch;

    const credential = await resolveGrokCredential({ env: {}, fetch, grokHome });

    expect(credential).toMatchObject({ env: { XAI_API_KEY: 'access-2' }, kind: 'subscription' });
    expect(requests[1]).toContain('grant_type=refresh_token');
    expect(requests[1]).toContain(`client_id=${CLIENT}`);
    expect((await lstat(join(grokHome, 'auth.json'))).isSymbolicLink()).toBe(true);
    const stored = JSON.parse(await readFile(hostAuth, 'utf8'))[`${ISSUER}::${CLIENT}`];
    expect(stored).toMatchObject({ key: 'access-2', refresh_token: 'refresh-2' });
});

test('an API key in the launch env wins; no login leaves sign-in to Grok', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-grok-auth-')));
    roots.push(root);

    expect(await resolveGrokCredential({ env: { XAI_API_KEY: 'k' }, grokHome: root })).toEqual({
        kind: 'api-key',
    });
    expect(await resolveGrokCredential({ env: {}, grokHome: root })).toEqual({ kind: 'native' });
});

test('authenticates with the method Grok advertised for the credential', () => {
    const subscription = { env: {}, expiresAt: 0, kind: 'subscription' } as const;

    expect(grokAuthMethod(subscription, ['xai.api_key', 'grok.com'])).toBe('xai.api_key');
    expect(grokAuthMethod({ kind: 'native' }, ['xai.api_key', 'grok.com'])).toBe('grok.com');
    expect(grokAuthMethod({ kind: 'api-key' }, ['grok.com'])).toBe('grok.com');
    expect(grokAuthMethod({ kind: 'native' }, [])).toBeNull();
});
