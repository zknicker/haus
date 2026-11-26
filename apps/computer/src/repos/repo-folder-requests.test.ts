import { describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { repoFolderResultSchema } from '@haus/api';
import { checkoutAgentWorktree } from './agent-worktrees.ts';
import { githubAppGit } from './github-git.ts';
import { answerRepoFolderOperation, handleRepoFolderRequest } from './repo-folder-requests.ts';
import { git, registerRepoFixture } from './repo.fixture.ts';

const repos = registerRepoFixture();

describe('repo folder requests', () => {
    test("inspect reads a checkout's top level and its GitHub repo, from any folder inside it", async () => {
        const fixture = repos();
        const folder = fixture.folder();
        await mkdir(join(folder, 'src'));
        const scope = { dataRoot: fixture.dataRoot, serverId: 'srv_1' };

        expect(
            await answerRepoFolderOperation({ kind: 'inspect', path: join(folder, 'src') }, scope)
        ).toEqual({
            kind: 'inspect',
            path: folder,
            repository: 'acme/app',
        });
    });

    test('inspect refuses a folder off GitHub, a worktree, and a missing path', async () => {
        const fixture = repos();
        const scope = { dataRoot: fixture.dataRoot, serverId: 'srv_1' };
        const gitlab = fixture.folder(join(fixture.root, 'code', 'gitlab'));
        git(gitlab, 'remote', 'set-url', 'origin', 'https://gitlab.com/acme/app.git');
        const folder = fixture.folder();
        const linked = join(fixture.root, 'code', 'linked');
        git(folder, 'worktree', 'add', '--quiet', '-b', 'side', linked);
        const inspect = (path: string) =>
            answerRepoFolderOperation({ kind: 'inspect', path }, scope);

        expect(await inspect(gitlab)).toEqual({
            error: `${gitlab}'s origin https://gitlab.com/acme/app.git is not a repo on github.com.`,
            kind: 'failed',
        });
        expect(await inspect(linked)).toEqual({
            error: `${linked} is a git worktree. Add its main checkout instead.`,
            kind: 'failed',
        });
        expect(await inspect(join(fixture.root, 'nope'))).toEqual({
            error: `${join(fixture.root, 'nope')} does not exist on this Computer.`,
            kind: 'failed',
        });
    });

    test('check says whether each folder is still there with its origin', async () => {
        const fixture = repos();
        const folder = fixture.folder();
        const moved = join(fixture.root, 'moved');
        const scope = { dataRoot: fixture.dataRoot, serverId: 'srv_1' };

        expect(
            await answerRepoFolderOperation(
                {
                    folders: [
                        { path: folder, repository: 'acme/app' },
                        { path: folder, repository: 'acme/other' },
                        { path: moved, repository: 'acme/app' },
                    ],
                    kind: 'check',
                },
                scope
            )
        ).toEqual({
            kind: 'check',
            states: [
                { path: folder, state: 'present' },
                { path: folder, state: 'other-origin' },
                { path: moved, state: 'missing' },
            ],
        });
    });

    test("worktrees lists this Server's Haus worktrees of a folder, and none once it is gone", async () => {
        const fixture = repos();
        const folder = fixture.folder();
        const scope = { dataRoot: fixture.dataRoot, serverId: 'srv_1' };
        git(folder, 'worktree', 'add', '--quiet', '-b', 'mine', join(fixture.root, 'code', 'mine'));
        const receipt = await checkoutAgentWorktree({
            ...scope,
            agentId: 'agt_alpha',
            folder,
            git: githubAppGit(scope.dataRoot, scope.serverId, {
                access: 'write',
                invocationId: 'inv_t',
            }),
            ref: null,
            repository: 'acme/app',
            sessionGeneration: 1,
        });
        const listed = await answerRepoFolderOperation({ kind: 'worktrees', path: folder }, scope);
        await rm(folder, { force: true, recursive: true });

        expect(listed).toEqual({ kind: 'worktrees', worktrees: [receipt.path] });
        expect(await answerRepoFolderOperation({ kind: 'worktrees', path: folder }, scope)).toEqual(
            {
                kind: 'worktrees',
                worktrees: [],
            }
        );
    });

    test('a request frame is answered with a repo-folder-result for its request id', async () => {
        const fixture = repos();
        const sent: unknown[] = [];
        const tracked: Promise<unknown>[] = [];
        const handled = handleRepoFolderRequest(
            {
                operation: { kind: 'worktrees', path: join(fixture.root, 'gone') },
                requestId: 'req_1',
                type: 'repo-folder-request',
            },
            {
                dataRoot: fixture.dataRoot,
                send: (frame) => sent.push(frame) > 0,
                serverId: 'srv_1',
                track: (work) => {
                    tracked.push(work);
                    return work;
                },
            }
        );
        await Promise.all(tracked);

        expect(handled).toBe(true);
        expect(sent.map((frame) => repoFolderResultSchema.parse(frame))).toEqual([
            {
                answer: { kind: 'worktrees', worktrees: [] },
                requestId: 'req_1',
                type: 'repo-folder-result',
            },
        ]);
        expect(
            handleRepoFolderRequest(
                { type: 'other' },
                { ...fixture, send: () => true, serverId: 'srv_1', track: (work) => work }
            )
        ).toBe(false);
    });
});
