import * as z from 'zod';

/** How a message reaches a Task: Capy's three delivery modes, `steer` by default (ADR 0062). */
export const taskDeliveryModes = ['steer', 'interrupt', 'queue'] as const;
export const taskDeliveryModeSchema = z.enum(taskDeliveryModes);
export type TaskDeliveryMode = z.infer<typeof taskDeliveryModeSchema>;
