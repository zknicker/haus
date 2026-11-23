import type { RepoFolderOperation } from '@haus/api';
import type { ComputerConnections } from '../computers/connections.ts';
import { RepoFolderComputerUnavailableError } from '../computers/repo-folder-replies.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { RepoFolderRefusalError } from './repo-errors.ts';
import { requireRepoFolderAdder, requireRepoFolderRemover } from './repo-folder-access.ts';
import { readComputerRepoFolders, readRepoFolder } from './repo-folder-read.ts';
import { addRepoFolder, deleteRepoFolder } from './repo-folder-write.ts';

type Connections = Pick<ComputerConnections, 'isOnline' | 'repoFolders'>;
interface Scope {
    computerId: string;
    serverId: string;
}

export async function addRepoFolderFromApp(
    db: HausDatabase,
    connections: Connections,
    userId: string | null,
    input: Scope & { path: string }
) {
    const access = await requireRepoFolderAdder(db, userId, input);
    const answer = await ask(connections, access, { kind: 'inspect', path: input.path });
    if (answer.kind !== 'inspect') {
        throw unexpected(access.name);
    }
    return await addRepoFolder(db, {
        ...input,
        addedByUserId: access.userId,
        computerName: access.name,
        path: answer.path,
        repository: answer.repository,
    });
}

export async function addRepoFolderFromCli(
    db: HausDatabase,
    userId: string,
    input: Scope & { path: string; repository: string }
) {
    const access = await requireRepoFolderAdder(db, userId, input);
    return await addRepoFolder(db, {
        ...input,
        addedByUserId: access.userId,
        computerName: access.name,
    });
}

export async function removeRepoFolder(
    db: HausDatabase,
    connections: Connections,
    userId: string | null,
    input: Scope & { repository: string }
) {
    const access = await requireRepoFolderRemover(db, userId, input);
    const folder = await readRepoFolder(db, input);
    if (!folder) {
        return { removed: false, repository: input.repository };
    }
    const answer = await ask(connections, access, { kind: 'worktrees', path: folder.path });
    if (answer.kind !== 'worktrees') {
        throw unexpected(access.name);
    }
    if (answer.worktrees.length > 0) {
        throw new RepoFolderRefusalError(
            'in-use',
            `Haus still has worktrees of ${folder.path} on ${access.name}: ${answer.worktrees.join(', ')}. Remove the folder once they are gone.`
        );
    }
    return {
        removed: await deleteRepoFolder(db, input),
        repository: input.repository,
    };
}

export async function readRepoFolderStates(
    db: HausDatabase,
    connections: Connections,
    access: Scope & { name: string }
) {
    const folders = await readComputerRepoFolders(db, access);
    if (folders.length === 0) {
        return { states: [] };
    }
    const answer = await ask(connections, access, {
        folders: folders.map(({ path, repository }) => ({ path, repository })),
        kind: 'check',
    });
    if (answer.kind !== 'check') {
        throw unexpected(access.name);
    }
    return { states: answer.states };
}

async function ask(
    connections: Connections,
    access: Scope & { name: string },
    operation: RepoFolderOperation
) {
    if (!connections.isOnline(access.computerId)) {
        throw offline(access.name);
    }
    const answer = await connections.repoFolders
        .request(access.computerId, operation)
        .catch((cause: unknown) => {
            throw cause instanceof RepoFolderComputerUnavailableError
                ? new RepoFolderRefusalError(
                      'offline',
                      `${access.name} did not answer. It must be online with an up-to-date Haus Computer; try again.`
                  )
                : cause;
        });
    if (answer.kind === 'failed') {
        throw new RepoFolderRefusalError('failed', answer.error);
    }
    return answer;
}

function offline(name: string) {
    return new RepoFolderRefusalError(
        'offline',
        `${name} is offline. It must be online so Haus can check its folders; try again once it is.`
    );
}

function unexpected(name: string) {
    return new Error(`${name} answered a repo folder request with the wrong kind of answer.`);
}
