import type {
    ServerRuntimeSettingsCommand,
    ServerSettings,
    ServerSettingsSetIdleCompactionInput,
} from '@haus/api';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serversTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireServerMembership } from './server-access.ts';

/** Only a Server Owner changes Server settings. */
export class ServerSettingsDeniedError extends Error {
    constructor() {
        super('Only a Server Owner can change Server settings.');
        this.name = 'ServerSettingsDeniedError';
    }
}

/** Any member reads the Server's settings. */
export async function readServerSettings(
    db: Pick<HausDatabase, 'select'>,
    member: HausUser | null,
    serverId: string
): Promise<ServerSettings> {
    await requireServerMembership(db, member, serverId);
    return await readStoredSettings(db, serverId);
}

/** An Owner turns idle compaction on or off for every Agent on the Server. */
export async function setServerIdleCompaction(
    db: HausDatabase,
    member: HausUser | null,
    input: ServerSettingsSetIdleCompactionInput
): Promise<ServerSettings> {
    const server = await requireServerMembership(db, member, input.serverId);
    if (server.role !== 'owner') {
        throw new ServerSettingsDeniedError();
    }
    await db
        .update(serversTable)
        .set({ idleCompaction: input.idleCompaction })
        .where(eq(serversTable.id, input.serverId));
    return await readStoredSettings(db, input.serverId);
}

/** The frame an attached Computer of the Server applies; sent on attach and on every change. */
export async function readServerRuntimeSettingsCommand(
    db: Pick<HausDatabase, 'select'>,
    serverId: string
): Promise<ServerRuntimeSettingsCommand> {
    const settings = await readStoredSettings(db, serverId);
    return { idleCompaction: settings.idleCompaction, type: 'server-runtime-settings' };
}

async function readStoredSettings(
    db: Pick<HausDatabase, 'select'>,
    serverId: string
): Promise<ServerSettings> {
    const [row] = await db
        .select({ idleCompaction: serversTable.idleCompaction })
        .from(serversTable)
        .where(eq(serversTable.id, serverId))
        .limit(1);
    return { idleCompaction: row?.idleCompaction ?? false };
}
