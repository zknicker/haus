import * as z from 'zod';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import { idSchema } from './chat.ts';
import { cloudAgentProviderSchema, cloudAgentUnreadyReasonSchema } from './cloud-agent-shared.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/** Sanitized Computer inventory excludes credentials and session material by construction. */
export const computerModelSchema = z
    .object({
        id: z.string().trim().min(1).max(128),
        label: z.string().trim().min(1).max(200),
        defaultReasoningEffort: agentReasoningEffortSchema.optional(),
        reasoningEfforts: z.array(agentReasoningEffortSchema).min(1).max(6).optional(),
    })
    .strict()
    .refine(
        (model) =>
            !model.defaultReasoningEffort ||
            (model.reasoningEfforts ?? ['low', 'medium', 'high']).includes(
                model.defaultReasoningEffort
            ),
        'The default reasoning effort must be supported by the model.'
    );

export const computerRuntimeSchema = z
    .object({
        id: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(200),
        models: z.array(computerModelSchema).max(200),
    })
    .strict();

export const agentSkillMetadataSchema = z
    .object({
        description: z.string().max(500),
        hash: z.string().regex(/^[a-f0-9]{64}$/u),
        modifiedAt: timestampSchema,
        name: z.string().trim().min(1).max(128),
    })
    .strict();

export type AgentSkillMetadata = z.infer<typeof agentSkillMetadataSchema>;

export const agentSkillImportRecordSchema = z.discriminatedUnion('status', [
    z
        .object({
            agentId: idSchema,
            requestId: idSchema,
            sourceId: idSchema,
            status: z.literal('accepted'),
            updatedAt: timestampSchema,
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            requestId: idSchema,
            skill: agentSkillMetadataSchema,
            sourceId: idSchema,
            status: z.literal('applied'),
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
            updatedAt: timestampSchema,
        })
        .strict(),
]);

export type AgentSkillImportRecord = z.infer<typeof agentSkillImportRecordSchema>;

export const importableSkillSchema = z
    .object({
        description: z.string().max(500),
        id: idSchema,
        name: z.string().trim().min(1).max(128),
        source: z.string().trim().min(1).max(300),
    })
    .strict();

export type ImportableSkill = z.infer<typeof importableSkillSchema>;

/**
 * One Cloud Agent provider this Computer can reach, and whether its credential
 * store currently resolves. Readiness is a Computer capability separate from
 * the runtime harness that happens to share a vendor.
 */
export const cloudAgentProviderReadinessSchema = z
    .object({
        provider: cloudAgentProviderSchema,
        ready: z.boolean(),
        reason: cloudAgentUnreadyReasonSchema.nullable(),
    })
    .strict();

export type CloudAgentProviderReadiness = z.infer<typeof cloudAgentProviderReadinessSchema>;

export const computerInventorySchema = z
    .object({
        agentSkillImports: z.array(agentSkillImportRecordSchema).max(100).optional(),
        agentSkills: z
            .array(
                z
                    .object({
                        agentId: idSchema,
                        skills: z.array(agentSkillMetadataSchema).max(500),
                    })
                    .strict()
            )
            .max(500)
            .optional(),
        cloudAgentProviders: z.array(cloudAgentProviderReadinessSchema).max(10).optional(),
        importableSkills: z.array(importableSkillSchema).max(1000).optional(),
        name: z.string().trim().min(1).max(100).optional(),
        runtimeIssues: z
            .array(
                z
                    .object({
                        runtimeId: z.enum(['codex', 'claude-code', 'grok-build', 'pi']),
                        kind: z.literal('authentication'),
                        observedAt: timestampSchema,
                    })
                    .strict()
            )
            .max(4)
            .optional(),
        runtimes: z.array(computerRuntimeSchema).max(50),
    })
    .strict();

export type ComputerInventory = z.infer<typeof computerInventorySchema>;
