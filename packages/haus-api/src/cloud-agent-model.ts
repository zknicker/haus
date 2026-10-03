import * as z from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });

export const cloudAgentModelsListed = 200;

/** A provider model id, verbatim as Cursor lists it. */
export const cloudAgentModelIdSchema = z.string().trim().min(1).max(200);

/**
 * One model the Computer's Cursor account can run, as Cursor's own catalog
 * lists it. Cursor publishes no price or tier, so Haus carries none.
 */
export const cloudAgentModelSchema = z
    .object({
        description: z.string().trim().min(1).max(500).nullable(),
        displayName: z.string().trim().min(1).max(200),
        id: cloudAgentModelIdSchema,
    })
    .strict();

/**
 * The newest model catalog a Computer read from Cursor. `refreshedAt` dates
 * the read, so a reader can tell a stale catalog from a fresh one.
 */
export const cloudAgentModelCatalogSchema = z
    .object({
        models: z.array(cloudAgentModelSchema).max(cloudAgentModelsListed),
        refreshedAt: timestampSchema,
    })
    .strict();

/**
 * The human-chosen Cloud Agent model for one Server. `auto` sends no model and
 * lets Cursor pick; `model` names one catalog id. Agents cannot override it.
 */
export const cloudAgentModelSettingSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('auto') }).strict(),
    z.object({ id: cloudAgentModelIdSchema, kind: z.literal('model') }).strict(),
]);

/**
 * The model one Run asked the provider for. `id` is what Haus sent, and `null`
 * means it sent none, so Cursor used the account's default model. `fallbackFrom` names the saved
 * model Haus could not send because the launching Computer's newest catalog
 * did not list it (or it had no catalog), so that Run fell back to the Cursor default.
 */
export const cloudAgentRunModelSchema = z
    .object({
        fallbackFrom: cloudAgentModelIdSchema.nullable(),
        id: cloudAgentModelIdSchema.nullable(),
    })
    .strict()
    .refine((model) => !(model.id && model.fallbackFrom), {
        message: 'A Run that sent a model did not fall back.',
        path: ['fallbackFrom'],
    });

export const cloudAgentSettingsGetInputSchema = z
    .object({ serverId: z.string().trim().min(1) })
    .strict();

export const cloudAgentSettingsSetModelInputSchema = z
    .object({ model: cloudAgentModelSettingSchema, serverId: z.string().trim().min(1) })
    .strict();

/**
 * The Server's Cloud Agent settings as a settings surface reads them.
 * `catalog` is the freshest catalog any of this Server's Computers reported,
 * or `null` when none has. `savedModelUnavailable` is true when the saved
 * choice is a model that catalog does not list, so launches fall back to the Cursor default.
 */
export const cloudAgentSettingsSchema = z
    .object({
        catalog: cloudAgentModelCatalogSchema.nullable(),
        model: cloudAgentModelSettingSchema,
        savedModelUnavailable: z.boolean(),
    })
    .strict();

export type CloudAgentModel = z.infer<typeof cloudAgentModelSchema>;
export type CloudAgentModelCatalog = z.infer<typeof cloudAgentModelCatalogSchema>;
export type CloudAgentModelSetting = z.infer<typeof cloudAgentModelSettingSchema>;
export type CloudAgentRunModel = z.infer<typeof cloudAgentRunModelSchema>;
export type CloudAgentSettings = z.infer<typeof cloudAgentSettingsSchema>;

/**
 * The one fallback rule: send the saved model only when the catalog lists it;
 * otherwise send none and record which saved model fell back.
 */
export function resolveCloudAgentRunModel(
    setting: CloudAgentModelSetting,
    catalog: CloudAgentModelCatalog | null
): CloudAgentRunModel {
    if (setting.kind === 'auto') {
        return { fallbackFrom: null, id: null };
    }
    return isCloudAgentModelListed(setting.id, catalog)
        ? { fallbackFrom: null, id: setting.id }
        : { fallbackFrom: setting.id, id: null };
}

export function isCloudAgentModelListed(
    modelId: string,
    catalog: CloudAgentModelCatalog | null
): boolean {
    return catalog?.models.some((model) => model.id === modelId) ?? false;
}
