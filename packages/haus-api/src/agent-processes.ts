import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

export const agentProcessIdSchema = z.string().regex(/^prc_[A-Za-z0-9_-]{16}$/u);
export type AgentProcessId = z.infer<typeof agentProcessIdSchema>;

export const computerProcessLimit = 8;

export const processExitTailChars = 4000;

export const processReadMaxBytes = 64 * 1024;

export const processReadOperationSchema = z
    .object({
        afterSeq: z.number().int().nonnegative(),
        kind: z.literal('process-read'),
        processId: agentProcessIdSchema,
    })
    .strict();

export const processKillOperationSchema = z
    .object({ kind: z.literal('process-kill'), processId: agentProcessIdSchema })
    .strict();

/** Computer to Server when a background process ends on its own; resent on connect until acknowledged. */
export const processExitFrameSchema = z
    .object({
        agentId: idSchema,
        cursor: z.number().int().nonnegative(),
        exitCode: z.number().int().nullable(),
        exitedAt: z.iso.datetime({ offset: true }),
        processId: agentProcessIdSchema,
        sessionGeneration: z.number().int().positive(),
        startedAt: z.iso.datetime({ offset: true }),
        tail: z.string().max(processExitTailChars),
        type: z.literal('process-exit'),
    })
    .strict();
export type ProcessExitFrame = z.infer<typeof processExitFrameSchema>;

export const processExitAckSchema = z
    .object({ processId: agentProcessIdSchema, type: z.literal('process-exit-ack') })
    .strict();
export type ProcessExitAck = z.infer<typeof processExitAckSchema>;

/** Server to Computer when a session generation ends: fence older invocations and kill its processes. */
export const sessionArchiveCommandSchema = z
    .object({
        agentId: idSchema,
        generation: z.number().int().positive(),
        type: z.literal('task-archive'),
    })
    .strict();
export type SessionArchiveCommand = z.infer<typeof sessionArchiveCommandSchema>;

export const processExitAttentionSchema = processExitFrameSchema
    .omit({ agentId: true, sessionGeneration: true, type: true })
    .extend({ computerName: z.string().trim().min(1).max(200) })
    .strict();
export type ProcessExitAttention = z.infer<typeof processExitAttentionSchema>;
