import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { createGithubApp } from './github-app.ts';
import { createGithubBot } from './github-bot.ts';

const mcpUrl = 'https://api.githubcopilot.com/mcp/';
const userAuthorization = 'Bearer ghu_user';
const hour = 3_600_000;

describe('createGithubBot', () => {
    test('sends a tool call for an installed owner as the App', async () => {
        const harness = await createHarness();
        await harness.call(toolCall('MerchBaseCo'));
        expect(harness.sent).toEqual(['Bearer ghs_1']);
        expect(harness.owners).toEqual(['MerchBaseCo']);
    });

    test('keeps the user token without an installation or an owner', async () => {
        const harness = await createHarness();
        await harness.call(toolCall('someone-else'));
        await harness.call(JSON.stringify({ method: 'tools/call', params: { arguments: {} } }));
        await harness.call(JSON.stringify({ method: 'tools/list', params: {} }));
        await harness.call('not json');
        expect(harness.sent).toEqual(new Array(4).fill(userAuthorization));
        expect(harness.mints()).toBe(0);
    });

    test('reuses a token until shortly before it expires', async () => {
        const harness = await createHarness();
        await harness.call(toolCall());
        harness.advance(hour - 6 * 60_000);
        await harness.call(toolCall());
        harness.advance(2 * 60_000);
        await harness.call(toolCall());
        expect(harness.sent).toEqual(['Bearer ghs_1', 'Bearer ghs_1', 'Bearer ghs_2']);
    });

    test('shares one mint between concurrent calls', async () => {
        const harness = await createHarness();
        await Promise.all([harness.call(toolCall()), harness.call(toolCall())]);
        expect(harness.mints()).toBe(1);
    });

    test('mints a fresh token once after a 401', async () => {
        const harness = await createHarness();
        harness.rejected.add('Bearer ghs_1');
        const response = await harness.call(toolCall());
        expect(response.status).toBe(200);
        expect(harness.sent).toEqual(['Bearer ghs_1', 'Bearer ghs_2']);
    });

    test('fails the call rather than posting as the user when minting fails', async () => {
        const harness = await createHarness();
        harness.mintStatus = 403;
        await expect(harness.call(toolCall())).rejects.toThrow('403');
        expect(harness.sent).toEqual([]);
    });
});

function toolCall(owner = 'merchbaseco') {
    return JSON.stringify({
        method: 'tools/call',
        params: { arguments: { owner, repo: 'core' }, name: 'add_issue_comment' },
    });
}

async function createHarness() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    let clock = 0;
    let minted = 0;
    const harness = {
        advance(ms: number) {
            clock += ms;
        },
        call: (body: string) =>
            bot.fetch('connection-one', next)(mcpUrl, {
                body,
                headers: { Authorization: userAuthorization },
                method: 'POST',
            }),
        mints: () => minted,
        mintStatus: 201,
        owners: [] as string[],
        rejected: new Set<string>(),
        sent: [] as (string | null)[],
    };
    const app = await createGithubApp(
        {
            appId: '123456',
            clientId: 'client',
            clientSecret: 'secret',
            privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
            slug: 'haus-test',
            webhookSecret: 'w'.repeat(32),
        },
        {
            fetch: (async () => {
                if (harness.mintStatus !== 201) {
                    return new Response('{}', { status: harness.mintStatus });
                }
                minted += 1;
                return Response.json(
                    {
                        expires_at: new Date(clock + hour).toISOString(),
                        token: `ghs_${minted}`,
                    },
                    { status: 201 }
                );
            }) as unknown as typeof fetch,
        }
    );
    const bot = createGithubBot(
        app,
        (_connectionId, owner) => {
            harness.owners.push(owner);
            return Promise.resolve(owner.toLowerCase() === 'merchbaseco' ? 42 : null);
        },
        () => clock
    );
    const next = (_url: string | URL, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get('Authorization');
        harness.sent.push(authorization);
        const rejected = authorization !== null && harness.rejected.has(authorization);
        return Promise.resolve(new Response('{}', { status: rejected ? 401 : 200 }));
    };
    return harness;
}
