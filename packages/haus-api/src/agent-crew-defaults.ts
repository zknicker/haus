import * as z from 'zod';
import { idSchema } from './chat.ts';

/**
 * `agent.setCrewDefaults`: the Machine and model a Captain's crew runs on (Capy's "Crew runs
 * on"). Null clears one back to its fallback: the Project's default Machine, the Captain's model.
 */
export const agentCrewDefaultsInputSchema = z
    .object({
        agentId: idSchema,
        crewComputerId: idSchema.nullable(),
        crewModel: z.string().trim().min(1).max(128).nullable(),
        serverId: idSchema,
    })
    .strict();

export type AgentCrewDefaultsInput = z.infer<typeof agentCrewDefaultsInputSchema>;

export const agentCrewDefaultsSchema = agentCrewDefaultsInputSchema.omit({ serverId: true });
