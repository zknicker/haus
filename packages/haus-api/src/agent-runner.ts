import { agentExecutionJournalRequestSchema } from './agent-execution-journal.ts';
import { agentInboxItemSchema } from './agent-inbox.ts';
import {
    cloudAgentCancelCommandSchema,
    cloudAgentCapabilityRequestSchema,
    cloudAgentReconcileCommandSchema,
} from './cloud-agent-protocol.ts';

export * from './agent-execution-journal.ts';
export * from './agent-inbox.ts';
export * from './cloud-agent-protocol.ts';

import * as z from 'zod';
import { agentTurnActivitySummarySchema } from './agent-activity.ts';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import {
    agentSkillFileRequestSchema,
    agentSkillFileSchema,
    agentWorkspaceRequestSchema,
    workspaceFileContentSchema,
    workspaceFileListSchema,
} from './agent-workspace-files.ts';
import { idSchema } from './chat.ts';
import { computerInventoryRefreshRequestSchema } from './computer-inventory-refresh.ts';
import {
    agentRuntimeBrowserActionResultSchema,
    agentRuntimeBrowserSettingsSchema,
    agentRuntimeSaveBrowserSettingsSchema,
} from './runtime/contracts.ts';
import { traceCarrierSchema } from './trace-context.ts';

const timestampSchema = z.iso.datetime({ offset: true });
/** Server→Computer launch command; Computer mints authority instead of receiving it. */
export const agentStartCommandSchema = z
    .object({
        agentId: idSchema,
        agentDescription: z.string().max(10_000).optional(),
        agentName: z.string().trim().min(1).max(64).optional(),
        chatId: idSchema,
        homeTimezone: z.string().trim().min(1).max(128).optional(),
        inbox: z.array(agentInboxItemSchema).max(100).default([]),
        /** Bodies are projected only for typed system attention or crash replay. */
        inboxDelivery: z.enum(['concrete', 'notice']),
        modelId: z.string().trim().min(1).max(128),
        runId: idSchema,
        runtimeId: z.string().trim().min(1).max(64),
        sessionGeneration: z.number().int().positive(),
        totalPending: z.number().int().nonnegative(),
        traceContext: traceCarrierSchema.optional(),
        type: z.literal('start'),
        webAccess: z.enum(['fetch-only', 'search', 'search-only']).optional(),
    })
    .strict();

export type AgentStartCommand = z.infer<typeof agentStartCommandSchema>;

/**
 * Terminates the named in-flight run on the Computer. A human Stop persists
 * Server-side and rides this frame down to kill the live turn; the Computer
 * kills the run's child process and reports nothing model-visible.
 */
export const agentStopCommandSchema = z
    .object({
        agentId: idSchema,
        runId: idSchema,
        type: z.literal('stop'),
    })
    .strict();

export type AgentStopCommand = z.infer<typeof agentStopCommandSchema>;

/**
 * Recreates one Agent's harness runner while preserving its native conversation.
 * The next resumed prompt receives the latest Computer-composed instructions.
 */
export const agentRestartCommandSchema = z
    .object({
        agentId: idSchema,
        type: z.literal('agent-restart'),
    })
    .strict();

export type AgentRestartCommand = z.infer<typeof agentRestartCommandSchema>;

export const agentResetCommandSchema = z
    .object({
        agentId: idSchema,
        kind: z.enum(['full', 'session']),
        sessionGeneration: z.number().int().positive(),
        type: z.literal('agent-reset'),
    })
    .strict();

export type AgentResetCommand = z.infer<typeof agentResetCommandSchema>;

/** Retires one Agent and erases only that Agent's Computer-local execution state. */
export const agentRetireCommandSchema = z
    .object({
        agentId: idSchema,
        type: z.literal('agent-retire'),
    })
    .strict();

export type AgentRetireCommand = z.infer<typeof agentRetireCommandSchema>;

/** Full desired executor snapshot applied by the assigned Computer. */
export const agentConfigureCommandSchema = z
    .object({
        agentDescription: z.string().trim().min(1).max(500).nullable(),
        agentId: idSchema,
        agentName: z.string().trim().min(1).max(80),
        /** The standing brief its creator wrote, and whose brief it is. */
        brief: z.string().trim().min(1).max(4000).nullable().default(null),
        briefAuthorHandle: z.string().trim().min(1).max(64).nullable().default(null),
        factoryKind: z.enum(['cove', 'ordinary']),
        modelId: z.string().trim().min(1).max(128),
        reasoningEffort: agentReasoningEffortSchema.default('medium'),
        runtimeId: z.string().trim().min(1).max(64),
        sessionGeneration: z.number().int().positive(),
        sessionResetKind: z.enum(['full', 'session']),
        type: z.literal('agent-configure'),
    })
    .strict();

export type AgentConfigureCommand = z.infer<typeof agentConfigureCommandSchema>;

/** Dedicated, replayable factory operation for the one onboarding Agent. */
export const coveApplyCommandSchema = z
    .object({
        agentDescription: z.literal('Onboarding Assistant'),
        agentId: idSchema,
        agentName: z.literal('Cove'),
        applicationId: idSchema,
        factoryKind: z.literal('cove'),
        modelId: z.string().trim().min(1).max(128),
        runtimeId: z.string().trim().min(1).max(64),
        sessionGeneration: z.number().int().positive(),
        type: z.literal('cove-apply'),
    })
    .strict();

export type CoveApplyCommand = z.infer<typeof coveApplyCommandSchema>;

export const agentSkillImportCommandSchema = z
    .object({
        agentId: idSchema,
        requestId: idSchema,
        sourceId: idSchema,
        type: z.literal('agent-skill-import'),
    })
    .strict();

export type AgentSkillImportCommand = z.infer<typeof agentSkillImportCommandSchema>;

/** Runs one persisted reminder script inside the owning Agent's Computer workspace. */
export const reminderScriptCommandSchema = z
    .object({
        agentId: idSchema,
        attentionId: idSchema,
        fireId: idSchema,
        reminderId: idSchema,
        script: z.string().min(1).max(16_384),
        type: z.literal('reminder-script'),
    })
    .strict();

export type ReminderScriptCommand = z.infer<typeof reminderScriptCommandSchema>;

/**
 * Work landed for a busy Agent. The full envelopes are accepted into the
 * Computer's durable inbox; only their content-free metadata projection is
 * injected into the live model turn.
 */
export const agentNoticeCommandSchema = z
    .object({
        agentId: idSchema,
        inbox: z.array(agentInboxItemSchema).min(1).max(100),
        runId: idSchema,
        totalPending: z.number().int().positive(),
        type: z.literal('notice'),
    })
    .strict();

export type AgentNoticeCommand = z.infer<typeof agentNoticeCommandSchema>;

/** Best-effort instruction to erase this Server attachment's Computer-local state. */
export const serverDeleteCommandSchema = z
    .object({
        type: z.literal('server-delete'),
    })
    .strict();

export type ServerDeleteCommand = z.infer<typeof serverDeleteCommandSchema>;

/**
 * Authenticated Browser request for one Computer attachment. Settings and lifecycle
 * go through Server; the App never accesses the Computer socket.
 */
export const browserRequestSchema = z
    .object({
        operation: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('get') }).strict(),
            z
                .object({
                    input: agentRuntimeSaveBrowserSettingsSchema,
                    kind: z.literal('save'),
                })
                .strict(),
            z.object({ kind: z.literal('open') }).strict(),
            z.object({ kind: z.literal('restart') }).strict(),
        ]),
        requestId: idSchema,
        traceContext: traceCarrierSchema.optional(),
        type: z.literal('browser-request'),
    })
    .strict();

export type BrowserRequest = z.infer<typeof browserRequestSchema>;
/** Every typed frame the Server sends down a Computer attachment socket. */
export const agentCommandSchema = z.discriminatedUnion('type', [
    computerInventoryRefreshRequestSchema,
    agentStartCommandSchema,
    agentStopCommandSchema,
    agentRestartCommandSchema,
    agentResetCommandSchema,
    agentRetireCommandSchema,
    agentConfigureCommandSchema,
    coveApplyCommandSchema,
    agentSkillImportCommandSchema,
    agentSkillFileRequestSchema,
    agentWorkspaceRequestSchema,
    agentExecutionJournalRequestSchema,
    browserRequestSchema,
    reminderScriptCommandSchema,
    agentNoticeCommandSchema,
    cloudAgentCancelCommandSchema,
    cloudAgentCapabilityRequestSchema,
    cloudAgentReconcileCommandSchema,
    serverDeleteCommandSchema,
]);

export type AgentCommand = z.infer<typeof agentCommandSchema>;

export const browserResultSchema = z
    .object({
        error: z.string().trim().min(1).max(500).optional(),
        requestId: idSchema,
        result: z
            .discriminatedUnion('kind', [
                z
                    .object({
                        kind: z.literal('settings'),
                        value: agentRuntimeBrowserSettingsSchema,
                    })
                    .strict(),
                z
                    .object({
                        kind: z.literal('action'),
                        value: agentRuntimeBrowserActionResultSchema,
                    })
                    .strict(),
            ])
            .optional(),
        type: z.literal('browser-result'),
    })
    .strict()
    .refine((value) => Boolean(value.error) !== Boolean(value.result));

export type BrowserResult = z.infer<typeof browserResultSchema>;

/**
 * The Computer's local-acceptance acknowledgement for a start command. An ack
 * means the Computer durably accepted the delivery, not that a model has seen
 * the work: it lets the Server stop retrying the delivery while the turn runs.
 */
export const agentDeliveryAckSchema = z
    .object({
        agentId: idSchema,
        runId: idSchema,
        type: z.literal('ack'),
    })
    .strict();

export type AgentDeliveryAck = z.infer<typeof agentDeliveryAckSchema>;

/** Computer proof that exact busy-turn notices were durably cached and injected. */
export const agentNoticeAckSchema = z
    .object({
        agentId: idSchema,
        workIds: z.array(idSchema).min(1).max(100),
        runId: idSchema,
        type: z.literal('notice-ack'),
    })
    .strict();

export type AgentNoticeAck = z.infer<typeof agentNoticeAckSchema>;

/** Durable Computer acknowledgement for the dedicated Cove factory operation. */
export const coveApplyResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            agentId: idSchema,
            applicationId: idSchema,
            factoryKind: z.literal('cove'),
            status: z.literal('applied'),
            type: z.literal('cove-apply-result'),
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            applicationId: idSchema,
            error: z.string().trim().min(1).max(300),
            factoryKind: z.literal('cove'),
            status: z.literal('failed'),
            type: z.literal('cove-apply-result'),
        })
        .strict(),
]);

export type CoveApplyResult = z.infer<typeof coveApplyResultSchema>;

/** Idempotent Computer result for one reminder script attention row. */
export const reminderScriptResultSchema = z
    .object({
        agentId: idSchema,
        attentionId: idSchema,
        exitCode: z.number().int(),
        fireId: idSchema,
        output: z.string().max(65_536),
        timedOut: z.boolean(),
        type: z.literal('reminder-script-result'),
    })
    .strict();

export type ReminderScriptResult = z.infer<typeof reminderScriptResultSchema>;

export const agentSkillImportResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            agentId: idSchema,
            requestId: idSchema,
            sourceId: idSchema,
            status: z.literal('accepted'),
            type: z.literal('agent-skill-import-result'),
            updatedAt: timestampSchema,
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            requestId: idSchema,
            skill: z
                .object({
                    description: z.string().max(500),
                    hash: z.string().regex(/^[a-f0-9]{64}$/u),
                    modifiedAt: timestampSchema,
                    name: z.string().trim().min(1).max(128),
                })
                .strict(),
            sourceId: idSchema,
            status: z.literal('applied'),
            type: z.literal('agent-skill-import-result'),
            updatedAt: timestampSchema,
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            error: z.string().trim().min(1).max(300),
            requestId: idSchema,
            sourceId: idSchema,
            status: z.literal('failed'),
            type: z.literal('agent-skill-import-result'),
            updatedAt: timestampSchema,
        })
        .strict(),
]);

export type AgentSkillImportResult = z.infer<typeof agentSkillImportResultSchema>;

export const agentSkillFileResultSchema = z
    .object({
        agentId: idSchema,
        error: z.string().trim().min(1).max(300).optional(),
        requestId: idSchema,
        result: z
            .discriminatedUnion('kind', [
                z.object({ kind: z.literal('read'), value: agentSkillFileSchema }).strict(),
                z.object({ kind: z.literal('updated'), value: agentSkillFileSchema }).strict(),
                z.object({ kind: z.literal('deleted') }).strict(),
            ])
            .optional(),
        type: z.literal('agent-skill-file-result'),
    })
    .strict()
    .refine((value) => Boolean(value.error) !== Boolean(value.result));

export type AgentSkillFileResult = z.infer<typeof agentSkillFileResultSchema>;

export const agentWorkspaceResultSchema = z
    .object({
        agentId: idSchema,
        error: z.string().trim().min(1).max(300).optional(),
        requestId: idSchema,
        result: z
            .discriminatedUnion('kind', [
                z
                    .object({
                        kind: z.literal('list'),
                        value: workspaceFileListSchema,
                    })
                    .strict(),
                z
                    .object({
                        kind: z.literal('read'),
                        value: workspaceFileContentSchema,
                    })
                    .strict(),
            ])
            .optional(),
        type: z.literal('agent-workspace-result'),
    })
    .strict()
    .refine((value) => Boolean(value.error) !== Boolean(value.result));

export type AgentWorkspaceResult = z.infer<typeof agentWorkspaceResultSchema>;

/**
 * A Computer mints a per-launch runner credential from its Computer credential
 * before spawning the Agent. The credential is scoped to exactly one Agent,
 * run, and Server. The launch chat carries turn context; Agent API routes still
 * resolve each target and membership Server-side.
 */
export const runnerMintRequestSchema = z
    .object({
        agentId: idSchema,
        chatId: idSchema,
        credentialHash: z.string().regex(/^[a-f0-9]{64}$/u),
        runId: idSchema,
    })
    .strict();

export type RunnerMintRequest = z.infer<typeof runnerMintRequestSchema>;

export const runnerTokenSchema = z.string().regex(/^grtr_[A-Za-z0-9_-]{43}$/u);

export const runnerMintResponseSchema = z
    .object({ runnerId: idSchema, runnerToken: runnerTokenSchema })
    .strict();

export type RunnerMintResponse = z.infer<typeof runnerMintResponseSchema>;

export const runnerRevokeRequestSchema = z
    .object({
        credentialHash: z.string().regex(/^[a-f0-9]{64}$/u),
        runnerId: idSchema,
    })
    .strict();

export type RunnerRevokeRequest = z.infer<typeof runnerRevokeRequestSchema>;

export * from './agent-message-input.ts';

/**
 * The compact turn summary a Computer pushes after a launch settles. Durable
 * collaboration and this compact activity live Server-side; the raw transcript,
 * logs, and workspace stay Computer-local behind the authorized live relay.
 */
export const agentTurnStatusSchema = z.enum(['completed', 'failed', 'interrupted']);
export const agentTurnFailureKindSchema = z.enum([
    'authentication',
    'configuration',
    'input',
    'rate-limit',
    'session-resume',
    'timeout',
    'transport',
    'unknown',
]);

export const agentTokenUsageSchema = z
    .object({
        cacheReadTokens: z.number().int().nonnegative(),
        cacheWriteTokens: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
    })
    .strict();

export const agentTurnSummarySchema = z
    .object({
        /** Older settled Computer run markers replay with an empty aggregate. */
        activity: agentTurnActivitySummarySchema.default({ operations: [] }),
        agentId: idSchema,
        endedAt: timestampSchema,
        failureKind: agentTurnFailureKindSchema.optional(),
        messageCount: z.number().int().nonnegative().max(10_000),
        modelId: z.string().trim().min(1),
        /**
         * Whether the turn produced model-visible output (any durable send).
         * A failed turn that produced output must not have its work requeued —
         * doing so would re-trigger the output. Acceptance alone never sets
         * this flag; an accepted crash replays at least once.
         */
        outputProduced: z.boolean(),
        runId: idSchema,
        runtimeId: z.string().trim().min(1),
        startedAt: timestampSchema,
        status: agentTurnStatusSchema,
        summary: z.string().max(2000),
        tokenUsage: agentTokenUsageSchema.nullable(),
        type: z.literal('turn'),
        visibleMessages: z
            .array(
                z.object({
                    chatId: idSchema,
                    id: idSchema,
                    sequence: z.number().int().positive(),
                })
            )
            .max(10_000)
            .default([]),
    })
    .strict();

export type AgentTurnSummary = z.infer<typeof agentTurnSummarySchema>;
export type AgentTokenUsage = z.infer<typeof agentTokenUsageSchema>;
