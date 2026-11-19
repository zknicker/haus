import * as z from 'zod';
import { channelColorSchema, channelIconSchema } from './channel-appearance.ts';
import { channelDescriptionInputSchema } from './channel-description.ts';
import { idSchema } from './chat-contract-primitives.ts';
import { chatSchema } from './chat.ts';
import { taskKeyPrefixSchema } from './task-key-ledger.ts';

export const projectNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/u);

export const projectSchema = z
    .object({
        chatId: idSchema,
        isHaus: z.boolean(),
        key: taskKeyPrefixSchema,
        keyEditable: z.boolean(),
        name: projectNameSchema,
        serverId: idSchema,
        taskKeyId: idSchema,
    })
    .strict();

export type Project = z.infer<typeof projectSchema>;

const projectEditFields = {
    color: channelColorSchema.nullable().optional(),
    description: channelDescriptionInputSchema,
    icon: channelIconSchema.nullable().optional(),
    key: taskKeyPrefixSchema.optional(),
};

export const projectCreateInputSchema = z
    .object({ ...projectEditFields, name: projectNameSchema, serverId: idSchema })
    .strict();

export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;

export const projectUpdateInputSchema = z
    .object({
        ...projectEditFields,
        chatId: idSchema,
        name: projectNameSchema.optional(),
        serverId: idSchema,
    })
    .strict();

export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>;

export const projectMutationResultSchema = z
    .object({ chat: chatSchema, project: projectSchema })
    .strict();

export type ProjectMutationResult = z.infer<typeof projectMutationResultSchema>;

export const projectListInputSchema = z.object({ serverId: idSchema }).strict();

export const projectListSchema = z.array(projectSchema);

export const projectErrorCodeSchema = z.enum(['PROJECT_KEY_FIXED', 'TASK_KEY_TAKEN']);

export type ProjectErrorCode = z.infer<typeof projectErrorCodeSchema>;

export const projectUpdatedEventSchema = z
    .object({ projectId: idSchema, serverId: idSchema })
    .strict();

export type ProjectUpdatedEvent = z.infer<typeof projectUpdatedEventSchema>;
