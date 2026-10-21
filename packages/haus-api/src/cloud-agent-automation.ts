import * as z from 'zod';
import { idSchema } from './chat.ts';
import { activeCloudAgentWorkLocationSchema } from './cloud-agent.ts';
import { cloudAgentWorkSchema } from './cloud-agent-shared.ts';

export const cloudAgentAutomationInputSchema = z
    .object({
        agentId: idSchema,
        history: z.boolean().default(false),
        serverId: idSchema,
    })
    .strict();

export const cloudAgentAutomationSchema = z
    .object({
        conversationChatId: idSchema,
        computerHealth: z.enum(['healthy', 'degraded', 'offline', 'update-required']).nullable(),
        location: activeCloudAgentWorkLocationSchema,
        notification: z.enum([
            'waiting',
            'pending',
            'delivered',
            'computer-removed',
            'chat-removed',
            'agent-retired',
            'unavailable',
        ]),
        work: cloudAgentWorkSchema,
    })
    .strict();
export const cloudAgentAutomationListSchema = z.array(cloudAgentAutomationSchema);
export type CloudAgentAutomation = z.infer<typeof cloudAgentAutomationSchema>;
