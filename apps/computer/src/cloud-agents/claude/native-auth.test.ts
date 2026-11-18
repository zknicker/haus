import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeCloudCredentials, readClaudeNativeAccount } from './native-auth.ts';

const restores: Array<() => Promise<void> | void> = [];
afterEach(async () => {
    for (const restore of restores.splice(0).reverse()) {
        await restore();
    }
});

/** A host HOME whose Claude login is the file Haus's Claude Code Agents read. */
async function hostHome(accessToken = 'sk-ant-oat01-agents'): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-auth-'));
    restores.push(() => rm(home, { force: true, recursive: true }));
    await mkdir(join(home, '.claude'), { recursive: true });
    await writeFile(
        join(home, '.claude', '.credentials.json'),
        JSON.stringify({
            claudeAiOauth: {
                accessToken,
                expiresAt: Date.now() + 60 * 60_000,
                refreshToken: 'refresh',
            },
        })
    );
    return home;
}

function stubProfile(status: number, body: unknown = {}) {
    const calls: Array<{ authorization: string | null; url: string }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((url: URL | string, init?: RequestInit) => {
        calls.push({
            authorization: new Headers(init?.headers).get('authorization'),
            url: String(url),
        });
        return Promise.resolve(Response.json(body, { status }));
    }) as typeof fetch;
    restores.push(() => {
        globalThis.fetch = original;
    });
    return calls;
}

test('Claude Cloud signs in with the login the Claude Code Agents use and checks it with Claude', async () => {
    const home = await hostHome();
    const calls = stubProfile(200, {
        account: { email: 'zach@example.com' },
        organization: { uuid: 'org-uuid' },
    });

    const account = await readClaudeNativeAccount(undefined, { HOME: home });

    expect(account).toEqual({
        email: 'zach@example.com',
        orgId: 'org-uuid',
        signedIn: true,
        token: 'sk-ant-oat01-agents',
    });
    expect(calls).toEqual([
        {
            authorization: 'Bearer sk-ant-oat01-agents',
            url: 'https://api.anthropic.com/api/oauth/profile',
        },
    ]);
    expect(await claudeCloudCredentials({ HOME: home })).toMatchObject({
        CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-agents',
    });
});

test('a login Claude rejects is not connected, rather than trusted because it is stored', async () => {
    const home = await hostHome();
    stubProfile(401);

    expect(await readClaudeNativeAccount(undefined, { HOME: home })).toEqual({ signedIn: false });
});

test('an API key is never a Claude Cloud login', async () => {
    const home = await hostHome();
    const calls = stubProfile(200);

    expect(
        await readClaudeNativeAccount(undefined, { ANTHROPIC_API_KEY: 'sk-ant-api', HOME: home })
    ).toEqual({ signedIn: false });
    expect(calls).toEqual([]);
});

test('an unexpected account-check failure is reported, not read as signed out', async () => {
    const home = await hostHome();
    stubProfile(500);

    await expect(readClaudeNativeAccount(undefined, { HOME: home })).rejects.toThrow('HTTP 500');
});
