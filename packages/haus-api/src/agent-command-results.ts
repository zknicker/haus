import * as z from 'zod';
import {
    agentSkillFileSchema,
    workspaceFileContentSchema,
    workspaceFileListSchema,
} from './agent-workspace-files.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/** Durable Computer acknowledgement for the dedicated Cove factory operation. */
export const coveApplyResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            agentId: idSchema,
            applicationId: idSchema,
            factoryKind: z.literal('cove'),
            status: z.literal('applied'),
            type: z.literal('cove-apply-result'),
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            applicationId: idSchema,
            error: z.string().trim().min(1).max(300),
            factoryKind: z.literal('cove'),
            status: z.literal('failed'),
            type: z.literal('cove-apply-result'),
        })
        .strict(),
]);

export type CoveApplyResult = z.infer<typeof coveApplyResultSchema>;

export const agentSkillImportResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            agentId: idSchema,
            requestId: idSchema,
            sourceId: idSchema,
            status: z.literal('accepted'),
            type: z.literal('agent-skill-import-result'),
            updatedAt: timestampSchema,
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            requestId: idSchema,
            skill: z
                .object({
                    description: z.string().max(500),
                    hash: z.string().regex(/^[a-f0-9]{64}$/u),
                    modifiedAt: timestampSchema,
                    name: z.string().trim().min(1).max(128),
                })
                .strict(),
            sourceId: idSchema,
            status: z.literal('applied'),
            type: z.literal('agent-skill-import-result'),
            updatedAt: timestampSchema,
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            error: z.string().trim().min(1).max(300),
            requestId: idSchema,
            sourceId: idSchema,
            status: z.literal('failed'),
            type: z.literal('agent-skill-import-result'),
            updatedAt: timestampSchema,
        })
        .strict(),
]);

export type AgentSkillImportResult = z.infer<typeof agentSkillImportResultSchema>;

export const agentSkillFileResultSchema = z
    .object({
        agentId: idSchema,
        error: z.string().trim().min(1).max(300).optional(),
        requestId: idSchema,
        result: z
            .discriminatedUnion('kind', [
                z.object({ kind: z.literal('read'), value: agentSkillFileSchema }).strict(),
                z.object({ kind: z.literal('updated'), value: agentSkillFileSchema }).strict(),
                z.object({ kind: z.literal('deleted') }).strict(),
            ])
            .optional(),
        type: z.literal('agent-skill-file-result'),
    })
    .strict()
    .refine((value) => Boolean(value.error) !== Boolean(value.result));

export type AgentSkillFileResult = z.infer<typeof agentSkillFileResultSchema>;

export const agentWorkspaceResultSchema = z
    .object({
        agentId: idSchema,
        error: z.string().trim().min(1).max(300).optional(),
        requestId: idSchema,
        result: z
            .discriminatedUnion('kind', [
                z
                    .object({
                        kind: z.literal('list'),
                        value: workspaceFileListSchema,
                    })
                    .strict(),
                z
                    .object({
                        kind: z.literal('read'),
                        value: workspaceFileContentSchema,
                    })
                    .strict(),
            ])
            .optional(),
        type: z.literal('agent-workspace-result'),
    })
    .strict()
    .refine((value) => Boolean(value.error) !== Boolean(value.result));

export type AgentWorkspaceResult = z.infer<typeof agentWorkspaceResultSchema>;
