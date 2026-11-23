import * as z from 'zod';
import { channelColorSchema, channelIconSchema } from './channel-appearance.ts';
import { channelDescriptionInputSchema } from './channel-description.ts';
import { idSchema } from './chat-contract-primitives.ts';
import { chatSchema } from './chat.ts';
import { taskKeyPrefixSchema } from './task-key-ledger.ts';
import { workerPlaceViewSchema } from './worker-place.ts';

export const projectNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/u);

export const projectSchema = z
    .object({
        archived: z.boolean(),
        chatId: idSchema,
        /** Where the Project's Workers run when the Agent names no place; null asks for one. */
        defaultWorkerPlace: workerPlaceViewSchema.nullable(),
        /** The non-retired Agents whose home this Project is. */
        homeAgentIds: z.array(idSchema),
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

export const allChannelUpdateInputSchema = projectUpdateInputSchema.omit({ key: true });

export type AllChannelUpdateInput = z.infer<typeof allChannelUpdateInputSchema>;

export const allChannelUpdateResultSchema = z.object({ chat: chatSchema }).strict();

export const projectMutationResultSchema = z
    .object({ chat: chatSchema, project: projectSchema })
    .strict();

export type ProjectMutationResult = z.infer<typeof projectMutationResultSchema>;

/** `agent.setHome`: a person moves an Agent's home. An Agent never moves itself. */
export const agentSetHomeInputSchema = z
    .object({ agentId: idSchema, projectId: idSchema, serverId: idSchema })
    .strict();

export type AgentSetHomeInput = z.infer<typeof agentSetHomeInputSchema>;

export const agentHomeSchema = z
    .object({ agentId: idSchema, homeProjectId: idSchema, previousProjectId: idSchema })
    .strict();

export type AgentHome = z.infer<typeof agentHomeSchema>;

export const projectListInputSchema = z.object({ serverId: idSchema }).strict();

export const projectListSchema = z.array(projectSchema);

/**
 * - `PROJECT_HAS_AGENTS`: archiving or deleting a Project that is still some
 *   Agent's home; move them first.
 * - `PROJECT_NAME_FIXED`: renaming `#all`, whose name is always `all`.
 * - `WORKER_PLACE_OFF`: a Computer default place whose "Workers can run here" switch is off.
 */
export const projectErrorCodeSchema = z.enum([
    'PROJECT_HAS_AGENTS',
    'PROJECT_KEY_FIXED',
    'PROJECT_NAME_FIXED',
    'TASK_KEY_TAKEN',
    'WORKER_PLACE_OFF',
]);

export type ProjectErrorCode = z.infer<typeof projectErrorCodeSchema>;

export const projectUpdatedEventSchema = z
    .object({ projectId: idSchema, serverId: idSchema })
    .strict();

export type ProjectUpdatedEvent = z.infer<typeof projectUpdatedEventSchema>;
