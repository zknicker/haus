import {
    type CloudAgentModelCatalog,
    type CloudAgentModelParams,
    type CloudAgentModelSetting,
    type CloudAgentProvider,
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
import { cloudAgentModelSettingsTable, computersTable } from '../postgres/schema.ts';
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

/** Any member may read one provider's Cloud Agent model and its catalog. */
export async function readCloudAgentSettings(
    db: Reader,
    member: HausUser | null,
    input: { provider: CloudAgentProvider; serverId: string }
): Promise<CloudAgentSettings> {
    await requireServerMembership(db, member, input.serverId);
    return await settingsOf(db, input);
}

/**
 * Saves one provider's Cloud Agent model. Only an Owner or Admin may, and only
 * a model the freshest reported catalog lists, with parameter values that model
 * offers: the provider is the source of truth, so Haus never stores an id or
 * value it has not seen. Agents have no path here.
 */
export async function setCloudAgentModel(
    db: HausDatabase,
    member: HausUser | null,
    input: { model: CloudAgentModelSetting; provider: CloudAgentProvider; serverId: string }
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
                await readServerModelCatalog(tx, input)
            );
            if (!model) {
                throw new CloudAgentModelUnlistedError(input.model.id);
            }
            const unoffered = unofferedCloudAgentModelParams(model, input.model.params);
            if (unoffered.length > 0) {
                throw new CloudAgentModelParamUnofferedError(model.id, unoffered);
            }
        }
        if (input.model.kind === 'model') {
            const choice = {
                modelId: input.model.id,
                modelParams: input.model.params,
                updatedAt: new Date(),
            };
            await tx
                .insert(cloudAgentModelSettingsTable)
                .values({ ...choice, provider: input.provider, serverId: input.serverId })
                .onConflictDoUpdate({
                    set: choice,
                    target: [
                        cloudAgentModelSettingsTable.serverId,
                        cloudAgentModelSettingsTable.provider,
                    ],
                });
        } else {
            await tx.delete(cloudAgentModelSettingsTable).where(settingRow(input));
        }
        return await settingsOf(tx, input);
    });
}

/**
 * The model a new Run asks its provider for: the Server's saved choice for
 * that provider when the launching Computer's newest catalog lists it,
 * otherwise Auto with the saved id recorded as the fallback. Saved params that
 * model no longer offers are dropped and recorded.
 */
export async function resolveRunModel(
    db: Reader,
    input: { computerId: string; provider: CloudAgentProvider; serverId: string }
): Promise<CloudAgentRunModel> {
    const [computer] = await db
        .select({ inventory: computersTable.reportedInventory })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    return resolveCloudAgentRunModel(
        await readSetting(db, input),
        catalogOf(computer?.inventory ?? null, input.provider)
    );
}

async function settingsOf(
    db: Reader,
    input: { provider: CloudAgentProvider; serverId: string }
): Promise<CloudAgentSettings> {
    const model = await readSetting(db, input);
    const catalog = await readServerModelCatalog(db, input);
    return {
        catalog,
        model,
        provider: input.provider,
        savedModelUnavailable:
            model.kind === 'model' && !isCloudAgentModelListed(model.id, catalog),
    };
}

async function readSetting(
    db: Reader,
    input: { provider: CloudAgentProvider; serverId: string }
): Promise<CloudAgentModelSetting> {
    const [row] = await db
        .select({
            modelId: cloudAgentModelSettingsTable.modelId,
            modelParams: cloudAgentModelSettingsTable.modelParams,
        })
        .from(cloudAgentModelSettingsTable)
        .where(settingRow(input))
        .limit(1);
    return settingOf(row ?? null);
}

function settingRow(input: { provider: CloudAgentProvider; serverId: string }) {
    return and(
        eq(cloudAgentModelSettingsTable.serverId, input.serverId),
        eq(cloudAgentModelSettingsTable.provider, input.provider)
    );
}

/** The freshest catalog any of this Server's Computers reported for the provider. */
async function readServerModelCatalog(
    db: Reader,
    input: { provider: CloudAgentProvider; serverId: string }
): Promise<CloudAgentModelCatalog | null> {
    const rows = await db
        .select({ inventory: computersTable.reportedInventory })
        .from(computersTable)
        .where(eq(computersTable.serverId, input.serverId));
    let freshest: CloudAgentModelCatalog | null = null;
    for (const row of rows) {
        const catalog = catalogOf(row.inventory, input.provider);
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
function catalogOf(
    inventory: ComputerInventory | null,
    provider: CloudAgentProvider
): CloudAgentModelCatalog | null {
    const reported = inventory?.cloudAgentProviders?.find(
        (candidate) => candidate.provider === provider
    )?.models;
    const parsed = cloudAgentModelCatalogSchema.safeParse(reported);
    return parsed.success ? parsed.data : null;
}

function settingOf(
    row: { modelId: string; modelParams: CloudAgentModelParams } | null
): CloudAgentModelSetting {
    if (!row) {
        return { kind: 'auto' };
    }
    // Stored jsonb is not re-validated on write, so a malformed value reads as model defaults.
    const params = cloudAgentModelParamsSchema.safeParse(row.modelParams);
    return {
        id: row.modelId,
        kind: 'model',
        params: params.success ? params.data : {},
    };
}
