import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * An Agent's Machine (ADR 0057 decision 7, amended 2026-11-23): the Computer its machine tools
 * run on when a call names no target, and where its `drive/` folder syncs. Storage and the Agent
 * contract keep the field name `computerId`.
 */
export const agentMachineInputSchema = z.object({ agentId: idSchema, serverId: idSchema }).strict();
export type AgentMachineInput = z.infer<typeof agentMachineInputSchema>;

/**
 * `agent.setMachine`, an Owner or Admin only. The destination must already allow the Agent, or the
 * caller must be its attacher, whose change is the grant. `fromLastSynced` moves without waiting
 * for an offline old Machine to push: its unpushed `drive/` edits stay there, unmerged. Naming the
 * current Machine cancels a pending change.
 */
export const agentSetMachineInputSchema = z
    .object({
        agentId: idSchema,
        computerId: idSchema,
        fromLastSynced: z.boolean(),
        serverId: idSchema,
    })
    .strict();
export type AgentSetMachineInput = z.infer<typeof agentSetMachineInputSchema>;

/**
 * What a pending change waits for: `turn`, the Agent's current turn to settle; `script`, a
 * reminder script still running on the old Machine; `drive`, the old Machine's push of its
 * folder; `machine`, the old Machine to come online and push.
 */
export const agentMachineWaitSchema = z.enum(['turn', 'script', 'drive', 'machine']);
export type AgentMachineWait = z.infer<typeof agentMachineWaitSchema>;

export const agentMachineChangeSchema = z
    .object({
        computerId: idSchema,
        fromLastSynced: z.boolean(),
        requestedAt: z.date(),
        waitingFor: agentMachineWaitSchema,
    })
    .strict();
export type AgentMachineChange = z.infer<typeof agentMachineChangeSchema>;

/** `agent.machine` and the `agent.setMachine` result; `agent.onUpdated` announces each step. */
export const agentMachineSchema = z
    .object({
        agentId: idSchema,
        change: agentMachineChangeSchema.nullable(),
        computerId: idSchema,
    })
    .strict();
export type AgentMachine = z.infer<typeof agentMachineSchema>;

/** One Captain's new Machine, chosen while removing the Device it is on. */
export const computerRemovalMoveSchema = z
    .object({ agentId: idSchema, computerId: idSchema })
    .strict();
export type ComputerRemovalMove = z.infer<typeof computerRemovalMoveSchema>;
