import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    type RepoFolderAnswer,
    type RepoFolderOperation,
    type RepoFolderResult,
    repoFolderRequestSchema,
    repoFolderResultSchema,
} from '@haus/api';
import {
    gitOutput,
    githubRepositoryOfRemote,
    readOrigin,
    WorkerCheckoutError,
} from '../workers/computer/git.ts';
import { worktreesRoot } from '../workers/computer/layout.ts';

interface FolderScope {
    dataRoot: string;
    serverId: string;
}

export function handleRepoFolderRequest(
    frame: unknown,
    input: FolderScope & {
        send(frame: unknown): boolean;
        track<T>(work: Promise<T>): Promise<T>;
    }
) {
    const parsed = repoFolderRequestSchema.safeParse(frame);
    if (!parsed.success) {
        return false;
    }
    const { requestId } = parsed.data;
    void input.track(
        answerRepoFolderOperation(parsed.data.operation, input)
            .then((answer) => {
                input.send(
                    repoFolderResultSchema.parse({
                        answer,
                        requestId,
                        type: 'repo-folder-result',
                    } satisfies RepoFolderResult)
                );
            })
            .catch((cause: unknown) => {
                console.error(
                    `Repo folder request ${requestId} was not answered: ${cause instanceof Error ? cause.message : cause}`
                );
            })
    );
    return true;
}

export async function answerRepoFolderOperation(
    operation: RepoFolderOperation,
    scope: FolderScope
) {
    try {
        switch (operation.kind) {
            case 'inspect':
                return {
                    kind: 'inspect',
                    ...(await inspectRepoFolder(operation.path)),
                } satisfies RepoFolderAnswer;
            case 'check':
                return {
                    kind: 'check',
                    states: await Promise.all(
                        operation.folders.map(async (folder) => ({
                            path: folder.path,
                            state: await folderState(folder.path, folder.repository),
                        }))
                    ),
                } satisfies RepoFolderAnswer;
            case 'worktrees':
                return {
                    kind: 'worktrees',
                    worktrees: await hausWorktreesOf(operation.path, scope),
                } satisfies RepoFolderAnswer;
            default: {
                const exhaustive: never = operation;
                return exhaustive;
            }
        }
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return {
            error: message.trim().slice(0, 500) || 'The folder request failed.',
            kind: 'failed',
        } satisfies RepoFolderAnswer;
    }
}

export async function inspectRepoFolder(path: string) {
    if (!existsSync(path)) {
        throw new WorkerCheckoutError(`${path} does not exist on this Computer.`);
    }
    const top = await gitOutput(['rev-parse', '--show-toplevel'], path);
    if (top === null) {
        throw new WorkerCheckoutError(`${path} is not a git checkout.`);
    }
    const folder = realpathSync(top);
    const [gitDir, commonDir] = await Promise.all(
        ['--git-dir', '--git-common-dir'].map((flag) =>
            gitOutput(['rev-parse', '--path-format=absolute', flag], folder)
        )
    );
    if (gitDir && commonDir && resolve(gitDir) !== resolve(commonDir)) {
        throw new WorkerCheckoutError(
            `${folder} is a git worktree. Add its main checkout instead.`
        );
    }
    const url = await readOrigin(folder);
    if (url === null) {
        throw new WorkerCheckoutError(`${folder} has no origin remote.`);
    }
    const repository = githubRepositoryOfRemote(url);
    if (repository === null) {
        throw new WorkerCheckoutError(`${folder}'s origin ${url} is not a repo on github.com.`);
    }
    return { path: folder, repository };
}

async function folderState(path: string, repository: string) {
    if (!existsSync(path)) {
        return 'missing' as const;
    }
    const url = await readOrigin(path);
    return url !== null && githubRepositoryOfRemote(url) === repository
        ? ('present' as const)
        : ('other-origin' as const);
}

export async function hausWorktreesOf(folder: string, scope: FolderScope) {
    if (!existsSync(join(folder, '.git'))) {
        return [];
    }
    const listing = await gitOutput(['worktree', 'list', '--porcelain'], folder);
    if (listing === null) {
        return [];
    }
    const root = realOrSelf(worktreesRoot(scope.dataRoot, scope.serverId));
    return listing
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length))
        .filter((path) => existsSync(path) && realOrSelf(path).startsWith(`${root}/`))
        .sort();
}

function realOrSelf(path: string) {
    return existsSync(path) ? realpathSync(path) : path;
}
