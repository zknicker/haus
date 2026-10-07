import { computerInventorySchema } from './computer-inventory.ts';
import { hausAgentStateSchema } from './haus-agent-state.ts';

export * from './computer-inventory.ts';
export * from './haus-agent-state.ts';

import * as z from 'zod';
import { agentTurnActivitySummarySchema } from './agent-activity.ts';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import { agentWakePauseSchema } from './agent-turn-failure.ts';
import { workspacePathSchema } from './agent-workspace-files.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export { agentReasoningEffortSchema } from './agent-execution.ts';

/**
 * `pending` — no Computer-reported effective snapshot matches the desired
 * runtime, model, and reasoning effort yet. `applied` — the Computer reports
 * the exact desired execution configuration with nothing missing. `degraded`
 * — the Computer reports missing local resources; Haus never substitutes a
 * different execution configuration.
 */
export const agentStatusSchema = z.enum(['applied', 'degraded', 'pending']);

export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentAvailabilitySchema = z.enum(['error', 'idle', 'offline', 'stopped', 'working']);

export type AgentAvailability = z.infer<typeof agentAvailabilitySchema>;

export const agentSchema = z
    .object({
        availability: agentAvailabilitySchema,
        avatarUrl: z.string().nullable(),
        computerId: idSchema,
        createdAt: timestampSchema,
        createdByAgentId: z.string().nullable(),
        createdByUserId: z.string().nullable(),
        description: z.string().max(500).nullable(),
        desiredModelId: z.string(),
        desiredReasoningEffort: agentReasoningEffortSchema.default('medium'),
        desiredRuntimeId: z.string(),
        displayName: z.string(),
        dmChatId: idSchema.nullable(),
        effectiveModelId: z.string().nullable(),
        effectiveReasoningEffort: agentReasoningEffortSchema.nullable(),
        effectiveReportedAt: timestampSchema.nullable(),
        effectiveRuntimeId: z.string().nullable(),
        factoryKind: z.enum(['cove', 'ordinary']),
        hausAgent: hausAgentStateSchema,
        handle: z.string(),
        id: idSchema,
        missingResources: z.array(z.string()),
        serverId: idSchema,
        status: agentStatusSchema,
        wakePause: agentWakePauseSchema.nullable().default(null),
    })
    .strict();

export type Agent = z.infer<typeof agentSchema>;

/** Deletion retires the Server record but preserves authored collaboration history. */
export const deleteAgentInputSchema = z
    .object({
        agentId: idSchema,
        confirmation: z.string().trim().min(1).max(80),
        serverId: idSchema,
    })
    .strict();

export type DeleteAgentInput = z.infer<typeof deleteAgentInputSchema>;

/** Runtime/model may change; the Computer assignment never does, so it is absent here. */
export const configureAgentInputSchema = z
    .object({
        agentId: idSchema,
        modelId: z.string().trim().min(1).max(128),
        reasoningEffort: agentReasoningEffortSchema.optional(),
        runtimeId: z.string().trim().min(1).max(64),
        serverId: idSchema,
    })
    .strict();

export type ConfigureAgentInput = z.infer<typeof configureAgentInputSchema>;

export const agentCreatedSchema = z.object({ agent: agentSchema }).strict();

export type AgentCreated = z.infer<typeof agentCreatedSchema>;

export const agentListInputSchema = z.object({ serverId: idSchema }).strict();

export const agentListSchema = z.array(agentSchema);

export const agentDetailInputSchema = z.object({ agentId: idSchema, serverId: idSchema }).strict();

/** Explicit opt-in request for one Computer-local Agent execution journal. */
export const agentExecutionJournalInputSchema = agentDetailInputSchema.extend({
    runId: idSchema,
});

export type AgentExecutionJournalInput = z.infer<typeof agentExecutionJournalInputSchema>;

export const agentTurnDetailInputSchema = agentExecutionJournalInputSchema;

export const agentActivityInputSchema = agentDetailInputSchema.extend({
    limit: z.number().int().min(1).max(100).default(50),
});

export const agentActivityEntrySchema = z
    .object({
        activity: agentTurnActivitySummarySchema,
        endedAt: timestampSchema,
        messageCount: z.number().int().nonnegative(),
        runId: idSchema,
        startedAt: timestampSchema,
        status: z.enum(['completed', 'failed', 'interrupted']),
        summary: z.string().max(2000),
    })
    .strict();

export type AgentActivityEntry = z.infer<typeof agentActivityEntrySchema>;

export const agentActivitySchema = z.array(agentActivityEntrySchema);

const agentLifecycleBaseSchema = z.object({
    agentId: idSchema,
    chatId: idSchema,
    emittedAt: timestampSchema,
    runId: idSchema,
    serverId: idSchema,
});

/**
 * Volatile execution projection for one Agent run. Durable turn
 * evidence remains in `agent.activity`; this feed exists so Haus App surfaces can
 * react immediately without inventing transcript rows.
 */
export const agentLifecycleEventSchema = z.discriminatedUnion('phase', [
    agentLifecycleBaseSchema
        .extend({
            phase: z.literal('working'),
        })
        .strict(),
    agentLifecycleBaseSchema
        .extend({
            phase: z.literal('reading'),
        })
        .strict(),
    agentLifecycleBaseSchema
        .extend({
            compositionId: idSchema,
            phase: z.literal('sending'),
            text: z.string().min(1).max(32_000),
        })
        .strict(),
    agentLifecycleBaseSchema
        .extend({
            outcome: z.enum(['completed', 'failed', 'interrupted', 'stopped']),
            phase: z.literal('settled'),
        })
        .strict(),
]);

export type AgentLifecycleEvent = z.infer<typeof agentLifecycleEventSchema>;

export const agentLifecycleSubscriptionInputSchema = z.object({ serverId: idSchema }).strict();

export const agentWorkspaceListInputSchema = agentDetailInputSchema.extend({
    includeHidden: z.boolean().optional().default(false),
    path: workspacePathSchema.default(''),
});

export const agentWorkspaceReadInputSchema = agentDetailInputSchema.extend({
    includeHidden: z.boolean().optional().default(false),
    path: workspacePathSchema.refine((value) => value.length > 0),
});

const agentSkillNameInputSchema = z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/u);

export const agentSkillFileReadInputSchema = agentDetailInputSchema.extend({
    name: agentSkillNameInputSchema,
});

export const agentSkillFileUpdateInputSchema = agentSkillFileReadInputSchema.extend({
    content: z.string().max(2 * 1024 * 1024),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const agentSkillFileDeleteInputSchema = agentSkillFileReadInputSchema.extend({
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/u),
});

/** Targets one Agent for a delivery control action or read. */
export const agentDeliveryControlInputSchema = z
    .object({ agentId: idSchema, serverId: idSchema })
    .strict();

export type AgentDeliveryControlInput = z.infer<typeof agentDeliveryControlInputSchema>;

export const agentResetInputSchema = agentDeliveryControlInputSchema.extend({
    kind: z.enum(['full', 'session']).default('session'),
});

export type AgentResetInput = z.infer<typeof agentResetInputSchema>;

export const agentImportSkillInputSchema = z
    .object({
        agentId: idSchema,
        serverId: idSchema,
        sourceId: idSchema,
    })
    .strict();

export type AgentImportSkillInput = z.infer<typeof agentImportSkillInputSchema>;

export const agentImportSkillResultSchema = z
    .object({
        requestId: idSchema,
        status: z.literal('accepted'),
    })
    .strict();

/**
 * The Server-owned delivery state for one Agent. `stopped` is the persisted
 * human Stop flag, `running` is whether a turn is in flight, and `pending` is
 * how many queued inbox units await the next turn.
 */
export const agentDeliveryStateSchema = z
    .object({
        agentId: idSchema,
        pending: z.number().int().nonnegative(),
        running: z.boolean(),
        stopped: z.boolean(),
    })
    .strict();

export type AgentDeliveryState = z.infer<typeof agentDeliveryStateSchema>;

/** Why an Agent's session was rotated; the App names the reason on the mark. */
export const agentSessionRotationReasonSchema = z.enum([
    'configuration',
    'full',
    'recovery',
    'session',
]);

export type AgentSessionRotationReason = z.infer<typeof agentSessionRotationReasonSchema>;

export const agentSessionRotationInputSchema = agentDetailInputSchema.extend({
    generation: z.number().int().positive(),
});

export type AgentSessionRotationInput = z.infer<typeof agentSessionRotationInputSchema>;

/**
 * One session rotation. Messages carry
 * the generation that wrote them; this is the durable record of the moment that
 * generation began. `previousDurationMs` is null for the first known rotation.
 */
export const agentSessionRotationSchema = z
    .object({
        generation: z.number().int().positive(),
        previousDurationMs: z.number().int().nonnegative().nullable(),
        reason: agentSessionRotationReasonSchema,
        rotatedAt: timestampSchema,
    })
    .strict();

export type AgentSessionRotation = z.infer<typeof agentSessionRotationSchema>;

/**
 * One durable delivery of one unit of work to one Agent. `seen` rows are
 * retained after settlement with the `turnId` that consumed them, so an
 * observer can tell "the Agent never received it" from "the Agent received it
 * and said nothing".
 */
export const agentDeliveryRecordSchema = z
    .object({
        acceptedAt: timestampSchema.nullable(),
        agentId: idSchema,
        chatId: idSchema,
        createdAt: timestampSchema,
        /** Null for typed work that carries no Chat message. */
        messageId: z.string().trim().min(1).max(128).nullable(),
        source: z.string().trim().min(1).max(64),
        seenAt: timestampSchema.nullable(),
        servedAt: timestampSchema.nullable(),
        state: z.enum(['queued', 'accepted', 'served', 'seen']),
        turnId: z.string().trim().min(1).max(128).nullable(),
        workId: idSchema,
    })
    .strict();

export type AgentDeliveryRecord = z.infer<typeof agentDeliveryRecordSchema>;

export const agentDeliveriesInputSchema = agentDetailInputSchema.extend({
    limit: z.number().int().min(1).max(100).default(50),
});

export type AgentDeliveriesInput = z.infer<typeof agentDeliveriesInputSchema>;

export const agentDeliveriesSchema = z.array(agentDeliveryRecordSchema);

/**
 * One Agent's Computer-reported effective state. A null execution field means
 * the Computer cannot prove that applied value; `missingResources` names each
 * missing runtime, model, skill, or connection.
 */
export const agentEffectiveStateSchema = z
    .object({
        agentId: idSchema,
        missingResources: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
        modelId: z.string().trim().min(1).max(128).nullable(),
        reasoningEffort: agentReasoningEffortSchema.nullable().default(null),
        runtimeId: z.string().trim().min(1).max(64).nullable(),
    })
    .strict();

export type AgentEffectiveState = z.infer<typeof agentEffectiveStateSchema>;

/** The compact report a Computer pushes over its attachment socket. */
export const computerReportSchema = z
    .object({
        agents: z.array(agentEffectiveStateSchema).max(500).default([]),
        inventory: computerInventorySchema,
    })
    .strict();

export type ComputerReport = z.infer<typeof computerReportSchema>;
