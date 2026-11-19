import * as z from 'zod';
import { idSchema } from './chat.ts';
import { workerSchema } from './worker-shared.ts';
import { activeWorkerLocationSchema } from './worker.ts';

export const workerAutomationInputSchema = z
    .object({
        agentId: idSchema,
        history: z.boolean().default(false),
        serverId: idSchema,
    })
    .strict();

export const workerAutomationSchema = z
    .object({
        conversationChatId: idSchema,
        computerHealth: z.enum(['healthy', 'degraded', 'offline', 'update-required']).nullable(),
        location: activeWorkerLocationSchema,
        notification: z.enum([
            'waiting',
            'pending',
            'delivered',
            'computer-removed',
            'chat-removed',
            'agent-retired',
            'unavailable',
        ]),
        worker: workerSchema,
    })
    .strict();
export const workerAutomationListSchema = z.array(workerAutomationSchema);
export type WorkerAutomation = z.infer<typeof workerAutomationSchema>;
