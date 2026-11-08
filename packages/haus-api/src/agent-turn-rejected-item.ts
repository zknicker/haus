import * as z from 'zod';

export const agentTurnRejectedItemSchema = z
    .object({ id: z.string().trim().min(1), reason: z.string().trim().min(1).max(500) })
    .strict();

export type AgentTurnRejectedItem = z.infer<typeof agentTurnRejectedItemSchema>;
