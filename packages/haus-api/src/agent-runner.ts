import { agentNoticeCommandSchema, agentStartCommandSchema } from './agent-delivery-frames.ts';
import { driveSyncCommandSchemas } from './agent-drive-sync.ts';
import { agentExecutionJournalAckSchema } from './agent-execution-journal-upload.ts';
import { invocationCommandSchemas } from './agent-invocations.ts';
import { agentStopBackgroundCommandSchema, agentStopCommandSchema } from './agent-stop-commands.ts';
import { agentSubagentWakeResultSchema } from './agent-subagent-wake-frames.ts';
import { browserRequestSchema } from './browser-frames.ts';
import { workerCloseCommandSchema } from './worker-computer-frames.ts';
import {
    workerStopCommandSchema,
    cloudAgentCapabilityRequestSchema,
    workerReconcileCommandSchema,
} from './worker-protocol.ts';
import { workerTurnStartFrameSchema } from './worker-turn-frames.ts';

export * from './agent-delivery-frames.ts';
export * from './agent-execution-journal.ts';
export * from './agent-invocations.ts';
export * from './agent-inbox.ts';
export * from './agent-stop-commands.ts';
export * from './agent-subagent-wake-frames.ts';
export * from './browser-frames.ts';
export * from './worker-protocol.ts';
export * from './reminder-script-frames.ts';

import * as z from 'zod';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import {
    agentSkillFileRequestSchema,
    agentWorkspaceRequestSchema,
} from './agent-workspace-files.ts';
import { idSchema } from './chat.ts';
import { computerInventoryRefreshRequestSchema } from './computer-inventory-refresh.ts';
import { computerSecretsRequestSchema } from './computer-secrets.ts';
import { hostSkillFileRequestSchema } from './host-skill-file.ts';
import { reminderScriptCommandSchema } from './reminder-script-frames.ts';
import { repoFolderRequestSchema } from './repos.ts';
import {
    serverDeleteCommandSchema,
    serverRuntimeSettingsCommandSchema,
} from './server-commands.ts';

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

/**
 * Server to Computer when a person revokes an Agent's access there: stop the
 * Agent's running invocation at once, the way Stop Agent Input stops a
 * `desktop` command, and settle each accepted, queued one `cancelled` with no
 * run. `agent-retire` fences the same way before it purges. Idempotent.
 */
export const agentFenceCommandSchema = z
    .object({
        agentId: idSchema,
        type: z.literal('agent-fence'),
    })
    .strict();

export type AgentFenceCommand = z.infer<typeof agentFenceCommandSchema>;

/**
 * Computer to Server, on every connect: the Agents whose folders or worktrees
 * it still holds under its data root. The Server answers `agent-retire` for
 * each retired one, so retirement reaches Computers that were not the home.
 */
export const agentHeldFrameSchema = z
    .object({
        agentIds: z.array(idSchema).max(10_000),
        type: z.literal('agent-held'),
    })
    .strict();

export type AgentHeldFrame = z.infer<typeof agentHeldFrameSchema>;

/** Full desired executor snapshot applied by the assigned Computer. */
export const agentConfigureCommandSchema = z
    .object({
        agentDescription: z.string().trim().min(1).max(500).nullable(),
        agentId: idSchema,
        agentName: z.string().trim().min(1).max(80),
        /** The standing brief its creator wrote, and whose brief it is. */
        brief: z.string().trim().min(1).max(4000).nullable().default(null),
        briefAuthorHandle: z.string().trim().min(1).max(64).nullable().default(null),
        modelId: z.string().trim().min(1).max(128),
        reasoningEffort: agentReasoningEffortSchema.default('medium'),
        runtimeId: z.string().trim().min(1).max(64),
        sessionGeneration: z.number().int().positive(),
        sessionResetKind: z.enum(['full', 'session']),
        type: z.literal('agent-configure'),
    })
    .strict();

export type AgentConfigureCommand = z.infer<typeof agentConfigureCommandSchema>;

export const agentSkillImportCommandSchema = z
    .object({
        agentId: idSchema,
        requestId: idSchema,
        sourceId: idSchema,
        type: z.literal('agent-skill-import'),
    })
    .strict();

export type AgentSkillImportCommand = z.infer<typeof agentSkillImportCommandSchema>;

/** Every typed frame the Server sends down a Computer attachment socket. */
export const agentCommandSchema = z.discriminatedUnion('type', [
    computerInventoryRefreshRequestSchema,
    repoFolderRequestSchema,
    agentStartCommandSchema,
    agentStopCommandSchema,
    agentStopBackgroundCommandSchema,
    agentSubagentWakeResultSchema,
    agentRestartCommandSchema,
    agentResetCommandSchema,
    agentRetireCommandSchema,
    agentFenceCommandSchema,
    agentConfigureCommandSchema,
    agentSkillImportCommandSchema,
    agentSkillFileRequestSchema,
    hostSkillFileRequestSchema,
    agentWorkspaceRequestSchema,
    agentExecutionJournalAckSchema,
    browserRequestSchema,
    computerSecretsRequestSchema,
    reminderScriptCommandSchema,
    agentNoticeCommandSchema,
    workerStopCommandSchema,
    cloudAgentCapabilityRequestSchema,
    workerReconcileCommandSchema,
    workerTurnStartFrameSchema,
    workerCloseCommandSchema,
    serverDeleteCommandSchema,
    serverRuntimeSettingsCommandSchema,
    ...invocationCommandSchemas,
    ...driveSyncCommandSchemas,
]);

export type AgentCommand = z.infer<typeof agentCommandSchema>;

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

export * from './agent-command-results.ts';

export * from './runner-credentials.ts';

export * from './agent-message-input.ts';
export * from './agent-turn-failure.ts';

export * from './agent-turn-summary.ts';
