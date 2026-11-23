import * as z from 'zod';
import { agentActivityFrameSchema } from './agent-activity.ts';
import { agentContextReportSchema } from './agent-context.ts';
import { agentNoticeCommandSchema, agentStartCommandSchema } from './agent-delivery-frames.ts';
import {
    agentExecutionJournalAckSchema,
    agentExecutionJournalRecordsFrameSchema,
} from './agent-execution-journal-upload.ts';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import { agentIdleCompactionReportSchema } from './agent-idle-compaction.ts';
import {
    invocationComputerTargetSchema,
    invocationOperationSchema,
    invocationOutcomeSchema,
    invocationOutputSchema,
    invocationTimeoutsMs,
} from './agent-invocations.ts';
import {
    agentDeliveryAckSchema,
    agentNoticeAckSchema,
    agentResetCommandSchema,
    agentRestartCommandSchema,
    agentRetireCommandSchema,
    agentTurnSummarySchema,
    runnerTokenSchema,
} from './agent-runner.ts';
import { agentStopCommandSchema } from './agent-stop-commands.ts';
import { agentThoughtFrameSchema } from './agent-thought.ts';
import { idSchema } from './chat.ts';
import { computerRuntimeSchema } from './computer-inventory.ts';
import {
    runnerModelConnectionDownFrameSchemas,
    runnerModelConnectionUpFrameSchemas,
} from './model-connections.ts';
import { runnerTurnSpanFrameSchema } from './runner-turn-span.ts';

export const runnerSocketPath = '/runner/attachment';

export const runnerHelloSchema = z
    .object({ token: z.string().min(32).max(512), type: z.literal('runner-hello') })
    .strict();

export const runnerHelloAcceptedSchema = z
    .object({ type: z.literal('runner-hello-accepted') })
    .strict();

export const runnerStartFrameSchema = z
    .object({
        /** The effort frozen onto the run; absent launches at the model's default. */
        reasoningEffort: agentReasoningEffortSchema.optional(),
        /** The connection the Server chose for this run; null when the Agent's provider has none. */
        modelConnectionId: idSchema.nullable(),
        runCredential: runnerTokenSchema,
        /** The Server the Agent belongs to; one runner serves every Server of a deployment. */
        serverId: idSchema,
        /** How the Agent's session last reset, applied once when the runner first sees its generation. */
        sessionResetKind: z.enum(['full', 'session']),
        start: agentStartCommandSchema,
        type: z.literal('runner-start'),
    })
    .strict();

export type RunnerStartFrame = z.infer<typeof runnerStartFrameSchema>;

/** The Servers whose Agents may idle-compact; each Agent follows its own Server. */
export const runnerRuntimeSettingsFrameSchema = z
    .object({
        idleCompactionServerIds: z.array(idSchema).max(10_000),
        type: z.literal('runner-runtime-settings'),
    })
    .strict();

export type RunnerRuntimeSettingsFrame = z.infer<typeof runnerRuntimeSettingsFrameSchema>;

export const dispatchKeySchema = z
    .object({
        runId: idSchema,
        seq: z.number().int().nonnegative(),
        toolCallId: z.string().trim().min(1).max(256),
    })
    .strict();

export type DispatchKey = z.infer<typeof dispatchKeySchema>;

export const invocationRequestFrameSchema = z
    .object({
        ...dispatchKeySchema.shape,
        agentId: idSchema,
        /** The call's `computer` field as the model wrote it; absent runs on the Agent's Machine. */
        computer: invocationComputerTargetSchema.optional(),
        operation: invocationOperationSchema,
        timeoutMs: z.number().int().positive().max(invocationTimeoutsMs.bash.max).optional(),
        type: z.literal('invocation-request'),
    })
    .strict();

export type InvocationRequestFrame = z.infer<typeof invocationRequestFrameSchema>;

export const invocationResultFrameSchema = z
    .object({
        ...dispatchKeySchema.shape,
        agentId: idSchema,
        exitCode: z.number().int().optional(),
        invocationId: idSchema.optional(),
        logPath: z.string().min(1).max(4096).optional(),
        outcome: invocationOutcomeSchema,
        output: invocationOutputSchema,
        truncated: z.boolean(),
        type: z.literal('invocation-result'),
    })
    .strict();

export type InvocationResultFrame = z.infer<typeof invocationResultFrameSchema>;

export const invocationCancelFrameSchema = z
    .object({ ...dispatchKeySchema.shape, agentId: idSchema, type: z.literal('invocation-cancel') })
    .strict();

export const runnerInventoryFrameSchema = z
    .object({
        harnesses: z.array(z.enum(['claude-agent-sdk', 'pi-durable'])).max(2),
        /** The curated models the runner serves, one runtime per model family. */
        runtimes: z.array(computerRuntimeSchema).max(10),
        type: z.literal('runner-inventory'),
    })
    .strict();

export type RunnerInventoryFrame = z.infer<typeof runnerInventoryFrameSchema>;

export const runnerDownFrameSchema = z.union([
    runnerHelloAcceptedSchema,
    runnerStartFrameSchema,
    agentNoticeCommandSchema,
    agentStopCommandSchema,
    agentRestartCommandSchema,
    agentResetCommandSchema,
    agentRetireCommandSchema,
    agentExecutionJournalAckSchema,
    invocationResultFrameSchema,
    runnerRuntimeSettingsFrameSchema,
    ...runnerModelConnectionDownFrameSchemas,
]);

export type RunnerDownFrame = z.infer<typeof runnerDownFrameSchema>;

export const runnerUpFrameSchema = z.union([
    runnerHelloSchema,
    runnerInventoryFrameSchema,
    agentDeliveryAckSchema,
    agentNoticeAckSchema,
    agentTurnSummarySchema,
    agentActivityFrameSchema,
    agentThoughtFrameSchema,
    agentExecutionJournalRecordsFrameSchema,
    agentIdleCompactionReportSchema,
    agentContextReportSchema,
    invocationRequestFrameSchema,
    invocationCancelFrameSchema,
    runnerTurnSpanFrameSchema,
    ...runnerModelConnectionUpFrameSchemas,
]);

export type RunnerUpFrame = z.infer<typeof runnerUpFrameSchema>;

export function dispatchIdOf(key: DispatchKey) {
    return `${key.runId}:${key.toolCallId}:${key.seq}`;
}
