import * as z from 'zod';
import { agentActivityFrameSchema } from './agent-activity.ts';
import { agentNoticeCommandSchema, agentStartCommandSchema } from './agent-delivery-frames.ts';
import {
    agentExecutionJournalAckSchema,
    agentExecutionJournalRecordsFrameSchema,
} from './agent-execution-journal-upload.ts';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import {
    invocationOperationSchema,
    invocationOutcomeSchema,
    invocationOutputSchema,
    invocationTimeoutsMs,
} from './agent-invocations.ts';
import {
    agentDeliveryAckSchema,
    agentNoticeAckSchema,
    agentTurnSummarySchema,
    runnerTokenSchema,
} from './agent-runner.ts';
import { agentStopCommandSchema } from './agent-stop-commands.ts';
import { agentThoughtFrameSchema } from './agent-thought.ts';
import { idSchema } from './chat.ts';

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
        runCredential: runnerTokenSchema,
        start: agentStartCommandSchema,
        type: z.literal('runner-start'),
    })
    .strict();

export type RunnerStartFrame = z.infer<typeof runnerStartFrameSchema>;

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

export const runnerLoginSchema = z
    .object({
        provider: z.enum(['claude', 'chatgpt', 'xai', 'gemini', 'openrouter']),
        state: z.enum(['ready', 'missing', 'failed']),
    })
    .strict();

export const runnerInventoryFrameSchema = z
    .object({
        harnesses: z.array(z.enum(['claude-agent-sdk', 'pi-durable'])).max(2),
        logins: z.array(runnerLoginSchema).max(8),
        type: z.literal('runner-inventory'),
    })
    .strict();

export type RunnerInventoryFrame = z.infer<typeof runnerInventoryFrameSchema>;

export const runnerDownFrameSchema = z.union([
    runnerHelloAcceptedSchema,
    runnerStartFrameSchema,
    agentNoticeCommandSchema,
    agentStopCommandSchema,
    agentExecutionJournalAckSchema,
    invocationResultFrameSchema,
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
    invocationRequestFrameSchema,
    invocationCancelFrameSchema,
]);

export type RunnerUpFrame = z.infer<typeof runnerUpFrameSchema>;

export function dispatchIdOf(key: DispatchKey) {
    return `${key.runId}:${key.toolCallId}:${key.seq}`;
}
