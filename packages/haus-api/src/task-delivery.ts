import * as z from 'zod';

/** How a message reaches a Task: Capy's three delivery modes, `steer` by default (ADR 0062). */
export const taskDeliveryModes = ['steer', 'interrupt', 'queue'] as const;
export const taskDeliveryModeSchema = z.enum(taskDeliveryModes);
export type TaskDeliveryMode = z.infer<typeof taskDeliveryModeSchema>;

/** `POST /api/agent/tasks/send`: an agent posts in a Task's chat as itself and wakes it. */
export const agentTaskSendInputSchema = z
    .object({
        body: z.string().trim().min(1).max(20_000),
        delivery: taskDeliveryModeSchema.default('steer'),
        task: z.string().trim().min(1).max(128),
    })
    .strict();

export type AgentTaskSendInput = z.infer<typeof agentTaskSendInputSchema>;
