import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * The task label and priority vocabulary. Claims carry it today; the board
 * Tasks product owns it (ADR 0051), so it keeps the `task` name.
 */
export const taskPriorities = ['none', 'urgent', 'high', 'medium', 'low'] as const;
export const taskLabelColors = [
    'red',
    'orange',
    'amber',
    'green',
    'teal',
    'blue',
    'purple',
    'pink',
    'gray',
] as const;

export const taskLabelSchema = z
    .object({
        color: z.enum(taskLabelColors),
        id: idSchema,
        name: z.string().trim().min(1).max(80),
    })
    .strict();

export type TaskLabel = z.infer<typeof taskLabelSchema>;

/** `taskLabel.onUpdated`: a label was created, renamed, recolored, or deleted. Every member. */
export const taskLabelUpdatedEventSchema = z
    .object({
        labelId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type TaskLabelUpdatedEvent = z.infer<typeof taskLabelUpdatedEventSchema>;

export const taskLabelListInputSchema = z.object({ serverId: idSchema }).strict();
export const taskLabelListSchema = z.array(taskLabelSchema);
export const taskLabelCreateInputSchema = z
    .object({
        name: z.string().trim().min(1).max(80),
        serverId: idSchema,
    })
    .strict();
export const taskLabelUpdateInputSchema = z
    .object({
        color: z.enum(taskLabelColors).optional(),
        labelId: idSchema,
        name: z.string().trim().min(1).max(80).optional(),
        serverId: idSchema,
    })
    .strict();
export const taskLabelDeleteInputSchema = z
    .object({ labelId: idSchema, serverId: idSchema })
    .strict();
export const taskLabelMutationSchema = z
    .object({
        label: taskLabelSchema.nullable(),
    })
    .strict();
