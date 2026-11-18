import * as z from 'zod';
import { idSchema } from './chat.ts';

const mentionOptionsBaseSchema = z
    .object({
        agentIds: z.array(idSchema).max(100).default([]),
        serverId: idSchema,
    })
    .strict();

export const mentionOptionsInputSchema = z.union([
    mentionOptionsBaseSchema.extend({ chatId: idSchema }),
    mentionOptionsBaseSchema.extend({ agentId: idSchema, targetKind: z.literal('agent-dm') }),
]);

export const mentionOptionSchema = z
    .object({
        description: z.string().nullable(),
        id: z.string().min(1),
        insertText: z.string().min(1),
        kind: z.enum(['agent', 'chat', 'skill', 'user']),
        label: z.string().min(1),
        metadata: z.record(z.string(), z.unknown()).optional(),
        projection: z.enum([
            'agent-reference',
            'chat-reference',
            'skill-activation',
            'user-reference',
        ]),
        sourceLabel: z.enum(['Agents', 'Channels', 'Humans', 'Skills']),
    })
    .strict();

export type MentionOption = z.infer<typeof mentionOptionSchema>;

export const mentionOptionsSchema = z
    .object({ options: z.array(mentionOptionSchema).max(1000) })
    .strict();
