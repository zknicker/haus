import * as z from 'zod';
import { idSchema } from './chat.ts';

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
 * A human Stop also ends the background sub-agents and shells the Agent left running between
 * turns: the Computer ends the Agent's runtime process once any live turn has settled and
 * parked it. Sent on every Stop, with or without an active run.
 */
export const agentStopBackgroundCommandSchema = z
    .object({
        agentId: idSchema,
        type: z.literal('agent-stop-background'),
    })
    .strict();

export type AgentStopBackgroundCommand = z.infer<typeof agentStopBackgroundCommandSchema>;
