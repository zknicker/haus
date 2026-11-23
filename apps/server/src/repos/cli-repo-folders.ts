import { eq } from 'drizzle-orm';
import type { ComputerConnections } from '../computers/connections.ts';
import { authenticateComputerLogin } from '../computers/login-session-service.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import { addRepoFolderFromCli, removeRepoFolder } from './manage-repo-folders.ts';
import { RepoFolderRefusalError } from './repo-errors.ts';
import { readRepoFolderAccess } from './repo-folder-access.ts';
import { readComputerRepoFolders } from './repo-folder-read.ts';

type Connections = Pick<ComputerConnections, 'isOnline' | 'repoFolders'>;

export async function addRepoFolderByCli(
    db: HausDatabase,
    input: { accessToken: string; computerId: string; path: string; repository: string }
) {
    const scope = await resolveCli(db, input);
    return await addRepoFolderFromCli(db, scope.userId, { ...scope, ...input });
}

export async function removeRepoFolderByCli(
    db: HausDatabase,
    connections: Connections,
    input: { accessToken: string; computerId: string; repository: string }
) {
    const scope = await resolveCli(db, input);
    return await removeRepoFolder(db, connections, scope.userId, { ...scope, ...input });
}

export async function listRepoFoldersByCli(
    db: HausDatabase,
    input: { accessToken: string; computerId: string }
) {
    const scope = await resolveCli(db, input);
    const access = await readRepoFolderAccess(db, scope.userId, scope);
    return {
        computerName: access.name,
        folders: await readComputerRepoFolders(db, scope),
    };
}

async function resolveCli(db: HausDatabase, input: { accessToken: string; computerId: string }) {
    const login = await authenticateComputerLogin(db, { accessToken: input.accessToken });
    const [computer] = await db
        .select({ serverId: computersTable.serverId })
        .from(computersTable)
        .where(eq(computersTable.id, input.computerId))
        .limit(1);
    if (!computer) {
        throw new RepoFolderRefusalError('missing', 'This Computer is no longer attached.');
    }
    return { computerId: input.computerId, serverId: computer.serverId, userId: login.userId };
}
