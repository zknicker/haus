import {
    type CloudAgentModelCatalog,
    type CloudAgentModelParams,
    type CloudAgentModelSetting,
    type CloudAgentRunModel,
    type CloudAgentSettings,
    type ComputerInventory,
    cloudAgentModelCatalogSchema,
    cloudAgentModelParamsSchema,
    findCloudAgentModel,
    hasServerAdminAuthority,
    isCloudAgentModelListed,
    resolveCloudAgentRunModel,
    unofferedCloudAgentModelParams,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, serversTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';

type Reader = Pick<HausDatabase, 'select'>;

export class CloudAgentSettingsDeniedError extends Error {
    constructor() {
        super('Only a Server Owner or Admin can choose the Cloud Agent model.');
        this.name = 'CloudAgentSettingsDeniedError';
    }
}

export class CloudAgentModelUnlistedError extends Error {
    constructor(modelId: string) {
        super(`No Computer on this Server lists the Cloud Agent model ${modelId}.`);
        this.name = 'CloudAgentModelUnlistedError';
    }
}

export class CloudAgentModelParamUnofferedError extends Error {
    constructor(modelId: string, params: string[]) {
        super(
            `The Cloud Agent model ${modelId} does not offer the chosen ${params.join(' and ')}.`
        );
        this.name = 'CloudAgentModelParamUnofferedError';
    }
}

/** Any member may read the Server's Cloud Agent model and its catalog. */
export async function readCloudAgentSettings(
    db: Reader,
    member: HausUser | null,
    serverId: string
): Promise<CloudAgentSettings> {
    await requireServerMembership(db, member, serverId);
    return await settingsOf(db, serverId);
}

/**
 * Saves the Server's Cloud Agent model. Only an Owner or Admin may, and only a
 * model the freshest reported catalog lists, with parameter values that model
 * offers: Cursor is the source of truth, so Haus never stores an id or value it
 * has not seen. Agents have no path here.
 */
export async function setCloudAgentModel(
    db: HausDatabase,
    member: HausUser | null,
    input: { model: CloudAgentModelSetting; serverId: string }
): Promise<CloudAgentSettings> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);
        if (!hasServerAdminAuthority(server.role)) {
            throw new CloudAgentSettingsDeniedError();
        }
        if (input.model.kind === 'model') {
            const model = findCloudAgentModel(
                input.model.id,
                await readServerModelCatalog(tx, input.serverId)
            );
            if (!model) {
                throw new CloudAgentModelUnlistedError(input.model.id);
            }
            const unoffered = unofferedCloudAgentModelParams(model, input.model.params);
            if (unoffered.length > 0) {
                throw new CloudAgentModelParamUnofferedError(model.id, unoffered);
            }
        }
        await tx
            .update(serversTable)
            .set(
                input.model.kind === 'model'
                    ? {
                          cloudAgentModelId: input.model.id,
                          cloudAgentModelParams: input.model.params,
                      }
                    : { cloudAgentModelId: null, cloudAgentModelParams: {} }
            )
            .where(eq(serversTable.id, input.serverId));
        return await settingsOf(tx, input.serverId);
    });
}

/**
 * The model a new Run asks the provider for: the Server's saved choice when the
 * launching Computer's newest catalog lists it, otherwise Auto with the saved id
 * recorded as the fallback. Saved params that model
 * no longer offers are dropped and recorded.
 */
export async function resolveRunModel(
    db: Reader,
    input: { computerId: string; serverId: string }
): Promise<CloudAgentRunModel> {
    const [row] = await db
        .select({
            cloudAgentModelId: serversTable.cloudAgentModelId,
            cloudAgentModelParams: serversTable.cloudAgentModelParams,
            inventory: computersTable.reportedInventory,
        })
        .from(serversTable)
        .leftJoin(
            computersTable,
            and(
                eq(computersTable.serverId, serversTable.id),
                eq(computersTable.id, input.computerId)
            )
        )
        .where(eq(serversTable.id, input.serverId))
        .limit(1);
    return resolveCloudAgentRunModel(settingOf(row ?? null), catalogOf(row?.inventory ?? null));
}

async function settingsOf(db: Reader, serverId: string): Promise<CloudAgentSettings> {
    const [server] = await db
        .select({
            cloudAgentModelId: serversTable.cloudAgentModelId,
            cloudAgentModelParams: serversTable.cloudAgentModelParams,
        })
        .from(serversTable)
        .where(eq(serversTable.id, serverId))
        .limit(1);
    const model = settingOf(server ?? null);
    const catalog = await readServerModelCatalog(db, serverId);
    return {
        catalog,
        model,
        savedModelUnavailable:
            model.kind === 'model' && !isCloudAgentModelListed(model.id, catalog),
    };
}

/** The freshest catalog any of this Server's Computers reported. */
async function readServerModelCatalog(
    db: Reader,
    serverId: string
): Promise<CloudAgentModelCatalog | null> {
    const rows = await db
        .select({ inventory: computersTable.reportedInventory })
        .from(computersTable)
        .where(eq(computersTable.serverId, serverId));
    let freshest: CloudAgentModelCatalog | null = null;
    for (const row of rows) {
        const catalog = catalogOf(row.inventory);
        if (
            catalog &&
            (!freshest || Date.parse(catalog.refreshedAt) > Date.parse(freshest.refreshedAt))
        ) {
            freshest = catalog;
        }
    }
    return freshest;
}

/** Stored inventories are not re-validated on write, so the catalog is parsed on read. */
function catalogOf(inventory: ComputerInventory | null): CloudAgentModelCatalog | null {
    const reported = inventory?.cloudAgentProviders?.find(
        (provider) => provider.provider === 'cursor'
    )?.models;
    const parsed = cloudAgentModelCatalogSchema.safeParse(reported);
    return parsed.success ? parsed.data : null;
}

function settingOf(
    row: { cloudAgentModelId: string | null; cloudAgentModelParams: CloudAgentModelParams } | null
): CloudAgentModelSetting {
    if (!row?.cloudAgentModelId) {
        return { kind: 'auto' };
    }
    // Stored jsonb is not re-validated on write, so a malformed value reads as model defaults.
    const params = cloudAgentModelParamsSchema.safeParse(row.cloudAgentModelParams);
    return {
        id: row.cloudAgentModelId,
        kind: 'model',
        params: params.success ? params.data : {},
    };
}
