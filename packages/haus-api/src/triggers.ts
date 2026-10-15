import * as z from 'zod';
import { idSchema } from './chat.ts';
import {
    githubTriggerConfigInputSchema,
    githubTriggerViewSchema,
} from './github-trigger-events.ts';
import {
    linearTriggerConfigInputSchema,
    linearTriggerViewSchema,
} from './linear-trigger-events.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/** Largest inbound trigger payload the Server stores verbatim. */
export const triggerPayloadMaxBytes = 65_536;
/** Largest payload excerpt the Agent envelope carries. */
export const triggerPayloadExcerptMaxChars = 8192;
/** Largest agent-authored standing instruction on one trigger. */
export const triggerInstructionMaxBytes = 4096;
export const triggerTitleMaxLength = 200;
export const triggerDedupeKeyMaxLength = 200;
/** Fire history page size: the default and the ceiling for `log --limit`. */
export const triggerLogLimitDefault = 50;
export const triggerLogLimitMax = 100;
/** Minted secret prefix. The rest is 32 random bytes, base64url. */
export const triggerSecretPrefix = 'grtt_';

/**
 * The instruction ceiling is UTF-8 bytes, matching the PostgreSQL
 * `octet_length` CHECK on `triggers.instruction`. Zod's `.max()` counts UTF-16
 * code units, so a multibyte instruction under that count would pass here and
 * fail at insert.
 */
export const triggerInstructionSchema = z
    .string()
    .trim()
    .refine(
        (value) => new TextEncoder().encode(value).length <= triggerInstructionMaxBytes,
        `Instruction must be at most ${triggerInstructionMaxBytes} bytes.`
    );
export const triggerTitleInputSchema = z.string().trim().min(1).max(triggerTitleMaxLength);

export const triggerStatusSchema = z.enum(['armed', 'disabled']);
export type TriggerStatus = z.infer<typeof triggerStatusSchema>;

/**
 * What kind of outside stimulus wakes the Agent. A `webhook` is a POST to a
 * private URL with a bearer secret; a `github` Trigger is fed by the Haus
 * GitHub App's webhook and a `linear` Trigger by the Haus Linear app's
 * workspace webhook, and neither has a URL or a secret.
 */
export const triggerKindSchema = z.enum(['webhook', 'github', 'linear']);
export type TriggerKind = z.infer<typeof triggerKindSchema>;

/**
 * Why the Server refused a well-formed Trigger request (`BAD_REQUEST` on tRPC,
 * `INVALID_ARG` on the Agent API). The message leads with the code.
 */
export const triggerRequestRefusalSchema = z.enum([
    /** The installation holds its cap of undeleted `github` Triggers. */
    'github_trigger_limit',
    /** The installation is not bound to this Server, suspended, or removed. */
    'github_installation_unavailable',
    /** The owning Agent lacks the connection grant, or GitHub needs a fresh sign-in. */
    'github_access_required',
    /** An event needs an App permission the installation has not accepted. */
    'github_permissions_missing',
    /** A selected repository is outside what the connection's GitHub user can reach. */
    'github_repositories_unavailable',
    /** The workspace connection holds its cap of undeleted `linear` Triggers. */
    'linear_trigger_limit',
    /** The Linear workspace is not `active` on this Server. */
    'linear_workspace_unavailable',
    /** The owning Agent lacks the Linear connection grant. */
    'linear_access_required',
    /** A referenced Linear object cannot be resolved now. */
    'linear_reference_unavailable',
    /** A name resolves to more than one Linear object; the message lists candidates. */
    'linear_reference_ambiguous',
    /** A team is outside the workspace actor's team access. */
    'linear_team_outside_access',
    /** The request names a field the Trigger's kind does not have. */
    'trigger_kind_mismatch',
    'trigger_has_no_secret',
]);
export type TriggerRequestRefusal = z.infer<typeof triggerRequestRefusalSchema>;

/** The fields every Trigger kind shares. */
export const triggerBaseShape = {
    anchorChatId: idSchema,
    /**
     * The asking message an Agent anchored on, or null when a human wired
     * the Trigger: a human Trigger anchors on the DM chat itself.
     */
    anchorMessageId: idSchema.nullable(),
    createdAt: timestampSchema,
    /** The creating human's Server handle, null when an Agent created it or the human has none. */
    createdByHandle: z.string().min(1).nullable(),
    /** The creating human, or null when the owning Agent created it itself. */
    createdByUserId: idSchema.nullable(),
    disabledAt: timestampSchema.nullable(),
    fireCount: z.number().int().nonnegative(),
    id: idSchema,
    instruction: z.string().min(1).nullable(),
    lastFiredAt: timestampSchema.nullable(),
    ownerAgentId: idSchema,
    ownerHandle: z.string().min(1),
    status: triggerStatusSchema,
    title: z.string().min(1).max(triggerTitleMaxLength),
    updatedAt: timestampSchema,
    version: z.number().int().positive(),
};

/** Never carries the secret: it exists only in create and rotate responses. */
export const webhookTriggerSchema = z
    .object({
        ...triggerBaseShape,
        kind: z.literal('webhook'),
        /** The public address an outside system POSTs to. Never carries the secret. */
        url: z.string().min(1),
    })
    .strict();
export type WebhookTrigger = z.infer<typeof webhookTriggerSchema>;

export const githubTriggerSchema = z
    .object({ ...triggerBaseShape, github: githubTriggerViewSchema, kind: z.literal('github') })
    .strict();
export type GithubTrigger = z.infer<typeof githubTriggerSchema>;

export const linearTriggerSchema = z
    .object({ ...triggerBaseShape, kind: z.literal('linear'), linear: linearTriggerViewSchema })
    .strict();
export type LinearTrigger = z.infer<typeof linearTriggerSchema>;

/** One Agent-owned Trigger, a union on `kind`. */
export const triggerSchema = z.discriminatedUnion('kind', [
    webhookTriggerSchema,
    githubTriggerSchema,
    linearTriggerSchema,
]);
export type Trigger = z.infer<typeof triggerSchema>;

/** One recorded inbound fire, without its stored payload. */
export const triggerFireSchema = z
    .object({
        contentType: z.string().nullable(),
        dedupeKey: z.string().nullable(),
        id: idSchema,
        payloadBytes: z.number().int().nonnegative(),
        receivedAt: timestampSchema,
        triggerId: idSchema,
    })
    .strict();

export type TriggerFire = z.infer<typeof triggerFireSchema>;

/** One fire with the payload the Server stored. */
export const triggerFireDetailSchema = triggerFireSchema.extend({ payload: z.string() }).strict();

export type TriggerFireDetail = z.infer<typeof triggerFireDetailSchema>;

export const triggerListInputSchema = z
    .object({
        agentId: idSchema.optional(),
        serverId: idSchema,
        status: triggerStatusSchema.optional(),
    })
    .strict();

export const triggerListSchema = z.array(triggerSchema);

/** Every per-trigger operator procedure addresses the row the same way. */
export const triggerIdInputSchema = z
    .object({
        serverId: idSchema,
        triggerId: idSchema,
    })
    .strict();

export const triggerRunsInputSchema = triggerIdInputSchema;

export const triggerRunsSchema = z.array(triggerFireSchema);

/** Rotate, delete, and test each address one existing trigger and nothing else. */
export const triggerRotateInputSchema = triggerIdInputSchema;
export const triggerDeleteInputSchema = triggerIdInputSchema;
export const triggerTestInputSchema = triggerIdInputSchema;

/**
 * Operator create, a union on `kind`. The trigger anchors on the DM between
 * the creating human and the owning Agent, so fires land there.
 */
export const triggerCreateInputSchema = z.discriminatedUnion('kind', [
    z
        .object({
            agentId: idSchema,
            instruction: triggerInstructionSchema.min(1).optional(),
            kind: z.literal('webhook'),
            serverId: idSchema,
            title: triggerTitleInputSchema,
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            github: githubTriggerConfigInputSchema,
            instruction: triggerInstructionSchema.min(1).optional(),
            kind: z.literal('github'),
            serverId: idSchema,
            title: triggerTitleInputSchema,
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            instruction: triggerInstructionSchema.min(1).optional(),
            kind: z.literal('linear'),
            linear: linearTriggerConfigInputSchema,
            serverId: idSchema,
            title: triggerTitleInputSchema,
        })
        .strict(),
]);
export type TriggerCreateInput = z.infer<typeof triggerCreateInputSchema>;

/**
 * Update at least one editable field. `instruction: null` (or an empty string)
 * clears the standing instruction; omitting it leaves it alone. `github` and
 * `linear` replace that kind's configuration whole and are refused on any
 * other kind.
 */
export const triggerUpdateInputSchema = z
    .object({
        github: githubTriggerConfigInputSchema.optional(),
        instruction: triggerInstructionSchema.nullable().optional(),
        linear: linearTriggerConfigInputSchema.optional(),
        serverId: idSchema,
        title: triggerTitleInputSchema.optional(),
        triggerId: idSchema,
    })
    .strict()
    .refine(
        (input) =>
            input.title !== undefined ||
            input.instruction !== undefined ||
            input.github !== undefined ||
            input.linear !== undefined,
        'Provide a title, an instruction, or a GitHub or Linear configuration to update.'
    );

export const triggerSetStatusInputSchema = z
    .object({
        serverId: idSchema,
        status: triggerStatusSchema,
        triggerId: idSchema,
    })
    .strict();

export const triggerResultSchema = z.object({ trigger: triggerSchema }).strict();

/** Operator webhook create and rotate: the only tRPC responses that ever carry a secret. */
export const triggerSecretResultSchema = z
    .object({
        curl: z.string().min(1),
        secret: z.string().min(1),
        trigger: webhookTriggerSchema,
        url: z.string().min(1),
    })
    .strict();
export type TriggerSecretResult = z.infer<typeof triggerSecretResultSchema>;

/** A webhook create answers with its secret; a `github` create with the Trigger alone. */
export const triggerCreateResultSchema = z.union([triggerSecretResultSchema, triggerResultSchema]);
export type TriggerCreateResult = z.infer<typeof triggerCreateResultSchema>;

export const triggerDeleteResultSchema = z
    .object({ deleted: z.literal(true), id: idSchema })
    .strict();

/** A test fire rides the same path as a real one, so it answers with a fire id. */
export const triggerTestResultSchema = z.object({ fireId: idSchema }).strict();
