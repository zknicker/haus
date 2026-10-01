import { z } from 'zod';
import { idSchema } from './chat.ts';

/** Largest host `SKILL.md` the relay carries; matches the Agent skill file cap. */
export const hostSkillFileMaxBytes = 2 * 1024 * 1024;

/** Operator read of one host-installed skill, addressed by its reported opaque source id. */
export const hostSkillFileInputSchema = z
    .object({
        computerId: idSchema,
        serverId: idSchema,
        sourceId: idSchema,
    })
    .strict();

export const hostSkillFileSchema = z
    .object({
        content: z.string().max(hostSkillFileMaxBytes),
    })
    .strict();

export type HostSkillFile = z.infer<typeof hostSkillFileSchema>;

export const hostSkillFileRequestSchema = z
    .object({
        requestId: idSchema,
        sourceId: idSchema,
        type: z.literal('host-skill-file-request'),
    })
    .strict();

export type HostSkillFileRequest = z.infer<typeof hostSkillFileRequestSchema>;

export const hostSkillFileErrorSchema = z.enum(['not-found', 'too-large', 'unreadable']);

export type HostSkillFileError = z.infer<typeof hostSkillFileErrorSchema>;

export const hostSkillFileResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            content: hostSkillFileSchema.shape.content,
            requestId: idSchema,
            status: z.literal('read'),
            type: z.literal('host-skill-file-result'),
        })
        .strict(),
    z
        .object({
            error: hostSkillFileErrorSchema,
            requestId: idSchema,
            status: z.literal('failed'),
            type: z.literal('host-skill-file-result'),
        })
        .strict(),
]);

export type HostSkillFileResult = z.infer<typeof hostSkillFileResultSchema>;
