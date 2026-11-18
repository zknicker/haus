import * as z from 'zod';
import { idSchema } from './chat.ts';

/**
 * The sub-agent wake handshake (specs/runtime-drivers.md "Background work"). Background work
 * an Agent started on its runtime finished or stopped after the turn that started it, and the
 * Computer asks the Server for a turn. Each request carries a Computer-minted `wakeId`; the
 * Server answers every request with a result, and the Computer keeps resending a request until
 * one arrives.
 */

/**
 * Computer→Server: background work this Agent started needs a turn. `finished`: the runtime
 * started a turn on its own to report it, which the wake run adopts. `stopped`: the process
 * running it ended (a crash or a Computer restart), so it was lost. The Server queues at most
 * one wake per Agent, only for the Agent's current session generation and Computer, never for
 * a stopped Agent, and never past the automation chain ceiling.
 */
export const agentSubagentWakeRequestSchema = z
    .object({
        agentId: idSchema,
        reason: z.enum(['finished', 'stopped']),
        sessionGeneration: z.number().int().positive(),
        type: z.literal('agent-subagent-wake'),
        wakeId: idSchema,
    })
    .strict();

export type AgentSubagentWakeRequest = z.infer<typeof agentSubagentWakeRequestSchema>;

/**
 * Server→Computer: the Server's admission of one wake request. `accepted`: a wake run is
 * queued (this request's, or one already queued that covers it). `refused`: no run will come,
 * so the Computer interrupts the turn the runtime started on its own and that turn runs no
 * further tools unadmitted. A resent request is answered again, idempotently.
 */
export const agentSubagentWakeResultSchema = z
    .object({
        agentId: idSchema,
        outcome: z.enum(['accepted', 'refused']),
        type: z.literal('agent-subagent-wake-result'),
        wakeId: idSchema,
    })
    .strict();

export type AgentSubagentWakeResult = z.infer<typeof agentSubagentWakeResultSchema>;

/**
 * Computer→Server: a run that was not the wake (a human message's run) adopted the turn the
 * runtime started on its own, so the report it asked a wake for is already handled. The Server
 * retires that wake while it is still queued; a wake that already leads a run is left alone.
 */
export const agentSubagentWakeRetireSchema = z
    .object({
        agentId: idSchema,
        type: z.literal('agent-subagent-wake-retire'),
        wakeId: idSchema,
    })
    .strict();

export type AgentSubagentWakeRetire = z.infer<typeof agentSubagentWakeRetireSchema>;
