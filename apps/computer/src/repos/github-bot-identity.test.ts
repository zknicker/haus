import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGithubBotIdentity } from './github-bot-identity.ts';

const identity = { email: '7+haus-test[bot]@users.noreply.github.com', name: 'haus-test[bot]' };
let root: string;
let serverRoot: string;
let failing = true;
let asked = 0;
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-bot-identity-')));
    server = Bun.serve({
        fetch: () => {
            asked += 1;
            return failing ? new Response(null, { status: 502 }) : Response.json(identity);
        },
        port: 0,
    });
    serverRoot = join(root, 'servers', 'srv_identityidentity');
    mkdirSync(serverRoot, { recursive: true });
    writeFileSync(
        join(serverRoot, 'attachment.json'),
        JSON.stringify({
            computerId: 'cmp_identityidentity',
            credential: 'computer-secret',
            serverId: 'srv_identityidentity',
            serverOrigin: server.url.origin,
            slug: 'identity',
        })
    );
});

afterAll(async () => {
    await server?.stop(true);
    await rm(root, { force: true, recursive: true });
});

test('a failed read is asked again on the next command, and a known bot is kept', async () => {
    const now = Date.now();
    expect(await readGithubBotIdentity(serverRoot, now)).toBeNull();
    failing = false;
    expect(await readGithubBotIdentity(serverRoot, now + 1)).toEqual(identity);
    expect(await readGithubBotIdentity(serverRoot, now + 2)).toEqual(identity);
    expect(asked).toBe(2);
});
