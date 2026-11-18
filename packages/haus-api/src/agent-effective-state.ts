import * as z from 'zod';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import { idSchema } from './chat.ts';
import { computerInventorySchema } from './computer-inventory.ts';

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
