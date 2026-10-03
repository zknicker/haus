import * as z from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });

export const cloudAgentModelsListed = 200;

/**
 * Cursor's catalog id for Auto, its per-run model router. Haus sends it for the
 * `auto` setting so a Run's meaning never depends on the account's default model.
 */
export const cursorAutoModelId = 'default';

/** A provider model id, verbatim as Cursor lists it. */
export const cloudAgentModelIdSchema = z.string().trim().min(1).max(200);

/**
 * The model families a settings surface groups by, derived from the model id
 * and name. Codex models are GPT models.
 */
export const cloudAgentModelFamilySchema = z.enum([
    'claude',
    'gpt',
    'gemini',
    'grok',
    'composer',
    'glm',
    'kimi',
    'other',
]);

/** The two user-facing model parameters Haus offers; Cursor's defaults cover the rest. */
export const cloudAgentModelParamNameSchema = z.enum(['effort', 'fast']);

const paramValueSchema = z.string().trim().min(1).max(100);
const providerParamIdSchema = z.string().trim().min(1).max(100);

export const cloudAgentModelEffortOptionSchema = z
    .object({ displayName: z.string().trim().min(1).max(100), value: paramValueSchema })
    .strict();

/**
 * One effort control normalized over Cursor's `effort`, `reasoning`, and
 * `reasoning_effort` spellings. `providerParamId` is the spelling this model
 * takes on the wire. `defaultValue` is the value Cursor's default variant
 * uses, or `null` when that variant names none.
 */
export const cloudAgentModelEffortSchema = z
    .object({
        defaultValue: paramValueSchema.nullable(),
        options: z.array(cloudAgentModelEffortOptionSchema).min(1).max(20),
        providerParamId: providerParamIdSchema,
    })
    .strict()
    .refine(
        (effort) =>
            effort.defaultValue === null ||
            effort.options.some((option) => option.value === effort.defaultValue),
        { message: 'The default effort is one of the options.', path: ['defaultValue'] }
    );

/** Fast mode, offered as on or off. `defaultValue` is Cursor's default variant's choice. */
export const cloudAgentModelFastSchema = z.object({ defaultValue: z.boolean() }).strict();

/**
 * One model the Computer's Cursor account can run, as Cursor's own catalog
 * lists it. Cursor publishes no price or tier, so Haus carries none. `order`
 * is the model's position in Cursor's list; `effort` and `fast` are `null`
 * when the model does not offer them.
 */
export const cloudAgentModelSchema = z
    .object({
        description: z.string().trim().min(1).max(500).nullable(),
        displayName: z.string().trim().min(1).max(200),
        effort: cloudAgentModelEffortSchema.nullable(),
        family: cloudAgentModelFamilySchema,
        fast: cloudAgentModelFastSchema.nullable(),
        id: cloudAgentModelIdSchema,
        order: z.int().min(0),
    })
    .strict();

/**
 * The newest model catalog a Computer read from Cursor. `autoAvailable` is true
 * when Cursor listed its Auto entry, which is a flag rather than a model.
 * `refreshedAt` dates the read, so a reader can tell a stale catalog from a fresh one.
 */
export const cloudAgentModelCatalogSchema = z
    .object({
        autoAvailable: z.boolean(),
        models: z.array(cloudAgentModelSchema).max(cloudAgentModelsListed),
        refreshedAt: timestampSchema,
    })
    .strict();

/** The parameters a human chose; an absent one means the model's own default. */
export const cloudAgentModelParamsSchema = z
    .object({ effort: paramValueSchema.optional(), fast: z.boolean().optional() })
    .strict();

/**
 * The human-chosen Cloud Agent model for one Server. `auto` is Cursor's Auto,
 * which picks a model for each Run; `model` names one catalog id and the parameters chosen for
 * it. Agents cannot override it.
 */
export const cloudAgentModelSettingSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('auto') }).strict(),
    z
        .object({
            id: cloudAgentModelIdSchema,
            kind: z.literal('model'),
            params: cloudAgentModelParamsSchema,
        })
        .strict(),
]);

/** One parameter a Run sent, under Haus's name and the provider's own id. */
export const cloudAgentRunModelParamSchema = z
    .object({
        name: cloudAgentModelParamNameSchema,
        providerParamId: providerParamIdSchema,
        value: paramValueSchema,
    })
    .strict();

/**
 * The model one Run asked the provider for. `id` is what Haus sent: a catalog
 * model, `default` for Auto, or `null` when the launching Computer's catalog
 * did not offer Auto, so Haus sent none and Cursor used the account's default
 * model. `params` are the parameters sent with a catalog model; an unsent one
 * took the model's default. `fallbackFrom` names the saved model Haus could not
 * send because the launching Computer's newest catalog did not list it (or it
 * had no catalog); that Run used Auto, or no model. `droppedParams` names saved parameters that model no longer offered with the
 * saved value, so they took the model's default.
 */
export const cloudAgentRunModelSchema = z
    .object({
        droppedParams: z.array(cloudAgentModelParamNameSchema).max(2),
        fallbackFrom: cloudAgentModelIdSchema.nullable(),
        id: cloudAgentModelIdSchema.nullable(),
        params: z.array(cloudAgentRunModelParamSchema).max(2),
    })
    .strict()
    .refine((model) => !(model.fallbackFrom && sentCatalogModel(model.id)), {
        message: 'A Run that sent a catalog model did not fall back.',
        path: ['fallbackFrom'],
    })
    .refine(
        (model) =>
            sentCatalogModel(model.id) ||
            (model.params.length === 0 && model.droppedParams.length === 0),
        {
            message: 'Only a Run that sent a catalog model carries parameters.',
            path: ['params'],
        }
    );

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
 * choice is a model that catalog does not list, so launches fall back to Auto.
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
export type CloudAgentModelEffort = z.infer<typeof cloudAgentModelEffortSchema>;
export type CloudAgentModelFamily = z.infer<typeof cloudAgentModelFamilySchema>;
export type CloudAgentModelParamName = z.infer<typeof cloudAgentModelParamNameSchema>;
export type CloudAgentModelParams = z.infer<typeof cloudAgentModelParamsSchema>;
export type CloudAgentModelSetting = z.infer<typeof cloudAgentModelSettingSchema>;
export type CloudAgentRunModel = z.infer<typeof cloudAgentRunModelSchema>;
export type CloudAgentRunModelParam = z.infer<typeof cloudAgentRunModelParamSchema>;
export type CloudAgentSettings = z.infer<typeof cloudAgentSettingsSchema>;

function sentCatalogModel(id: string | null): boolean {
    return id !== null && id !== cursorAutoModelId;
}
