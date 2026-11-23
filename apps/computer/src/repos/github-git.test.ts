import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computerGitCredentialPath } from '@haus/api';
import { agentGitEnvironment, githubAppGit } from './github-git.ts';

const serverId = 'srv_gitgitgitgitgitgi';
const identity = {
    email: '41898282+haus-test[bot]@users.noreply.github.com',
    name: 'haus-test[bot]',
};
const asked: unknown[] = [];
let root: string;
let server: ReturnType<typeof Bun.serve>;
let environment: Record<string, string>;

beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-github-git-')));
    server = Bun.serve({
        fetch: async (request) => {
            const url = new URL(request.url);
            if (
                url.pathname !== computerGitCredentialPath ||
                request.headers.get('authorization') !== 'Bearer computer-secret'
            ) {
                return new Response(null, { status: 401 });
            }
            const body = (await request.json()) as { repository: string };
            asked.push(body);
            return body.repository === 'acme/app'
                ? Response.json({ expiresAt: new Date().toISOString(), token: 'ghs_scoped' })
                : Response.json(
                      {
                          code: 'github_app_needs_access',
                          error: `The Haus GitHub App needs access to ${body.repository}.`,
                      },
                      { status: 403 }
                  );
        },
        port: 0,
    });
    const serverRoot = join(root, 'data', 'servers', serverId);
    mkdirSync(serverRoot, { recursive: true });
    writeFileSync(
        join(serverRoot, 'attachment.json'),
        JSON.stringify({
            computerId: 'cmp_gitgitgitgitgitgi',
            credential: 'computer-secret',
            serverId,
            serverOrigin: server.url.origin,
            slug: 'git',
        })
    );
    const home = join(root, 'home');
    mkdirSync(home);
    environment = {
        HOME: home,
        PATH: process.env.PATH ?? '',
        ...agentGitEnvironment(
            githubAppGit(join(root, 'data'), serverId, {
                access: 'write',
                invocationId: 'inv_gitgitgitgitgitgi',
            }),
            identity
        ),
    };
});

afterAll(async () => {
    await server?.stop(true);
    await rm(root, { force: true, recursive: true });
});

test("an Agent command's git gets a token scoped to the repo from the Server, never a person's", async () => {
    const filled = await git(
        ['credential', 'fill'],
        'protocol=https\nhost=github.com\npath=Acme/App.git\n\n'
    );

    expect(filled.exitCode).toBe(0);
    expect(filled.stdout).toContain('username=x-access-token\npassword=ghs_scoped\n');
    expect(asked.at(-1)).toEqual({
        access: 'write',
        invocationId: 'inv_gitgitgitgitgitgi',
        repository: 'acme/app',
    });
    const helpers = (await git(['config', '--get-all', 'credential.helper'])).stdout
        .trim()
        .split('\n');
    expect(helpers.slice(-2)).toEqual(['', environment.GIT_CONFIG_VALUE_1 ?? '']);
});

test('a refusal stops git with the reason, and asks nothing else', async () => {
    const filled = await git(
        ['credential', 'fill'],
        'protocol=https\nhost=github.com\npath=acme/secret.git\n\n'
    );

    expect(filled.exitCode).not.toBe(0);
    expect(filled.stderr).toContain('haus: The Haus GitHub App needs access to acme/secret.');
    expect(filled.stdout).not.toContain('password=');
});

test('GitHub SSH remotes go over HTTPS, and commits are the bot', async () => {
    const remote = await git(['ls-remote', '--get-url', 'git@github.com:acme/app.git']);
    expect(remote.stdout.trim()).toBe('https://github.com/acme/app.git');
    expect((await git(['var', 'GIT_AUTHOR_IDENT'])).stdout).toStartWith(
        'haus-test[bot] <41898282+haus-test[bot]@users.noreply.github.com>'
    );
});

async function git(args: string[], stdin = '') {
    const child = Bun.spawn(['git', ...args], {
        cwd: root,
        env: environment,
        stderr: 'pipe',
        stdin: Buffer.from(stdin),
        stdout: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    return { exitCode, stderr, stdout };
}
