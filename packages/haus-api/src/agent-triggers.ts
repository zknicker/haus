import * as z from 'zod';
import { idSchema } from './chat.ts';
import {
    githubTriggerConfigInputSchema,
    githubTriggerEventNameSchema,
} from './github-trigger-events.ts';
import { agentLinearTriggerConfigInputSchema } from './linear-trigger-events.ts';
import {
    githubTriggerSchema,
    linearTriggerSchema,
    triggerFireDetailSchema,
    triggerFireSchema,
    triggerInstructionSchema,
    triggerTitleInputSchema,
    webhookTriggerSchema,
} from './triggers.ts';

// The Agent CLI's Trigger contracts and the public inbound route's answers.

const anchorTarget = { anchorTarget: z.string().min(1) };

export const agentWebhookTriggerSchema = webhookTriggerSchema.extend(anchorTarget).strict();
export const agentGithubTriggerSchema = githubTriggerSchema.extend(anchorTarget).strict();
export const agentLinearTriggerSchema = linearTriggerSchema.extend(anchorTarget).strict();

/** The agent-facing view: the operator shape plus where the trigger is anchored. */
export const agentTriggerSchema = z.discriminatedUnion('kind', [
    agentWebhookTriggerSchema,
    agentGithubTriggerSchema,
    agentLinearTriggerSchema,
]);

export type AgentTrigger = z.infer<typeof agentTriggerSchema>;
export type AgentWebhookTrigger = z.infer<typeof agentWebhookTriggerSchema>;

/** Create input. An omitted `kind` is a webhook. */
export const agentTriggerCreateInputSchema = z.union([
    z
        .object({
            instruction: triggerInstructionSchema.min(1).optional(),
            kind: z.literal('webhook').default('webhook'),
            messageId: idSchema,
            title: triggerTitleInputSchema,
        })
        .strict(),
    z
        .object({
            github: githubTriggerConfigInputSchema,
            instruction: triggerInstructionSchema.min(1).optional(),
            kind: z.literal('github'),
            messageId: idSchema,
            title: triggerTitleInputSchema,
        })
        .strict(),
    z
        .object({
            instruction: triggerInstructionSchema.min(1).optional(),
            kind: z.literal('linear'),
            linear: agentLinearTriggerConfigInputSchema,
            messageId: idSchema,
            title: triggerTitleInputSchema,
        })
        .strict(),
]);
export type AgentTriggerCreateInput = z.infer<typeof agentTriggerCreateInputSchema>;

export const agentTriggerUpdateInputSchema = z
    .object({
        github: githubTriggerConfigInputSchema.optional(),
        instruction: triggerInstructionSchema.nullable().optional(),
        linear: agentLinearTriggerConfigInputSchema.optional(),
        title: triggerTitleInputSchema.optional(),
    })
    .strict()
    .refine(
        (input) => Object.values(input).some((value) => value !== undefined),
        'Provide a title, instruction, or GitHub or Linear configuration.'
    );
export type AgentTriggerUpdateInput = z.infer<typeof agentTriggerUpdateInputSchema>;

export const githubTriggerPreviewInputSchema = z
    .object({
        event: githubTriggerEventNameSchema,
        payload: z
            .record(z.string(), z.unknown())
            .refine(
                (payload) => new TextEncoder().encode(JSON.stringify(payload)).byteLength <= 60_000,
                'Webhook payload must be under 60,000 bytes.'
            ),
    })
    .strict();
export type GithubTriggerPreviewInput = z.infer<typeof githubTriggerPreviewInputSchema>;
export const githubTriggerPreviewResultSchema = z
    .object({
        groups: z.array(
            z.object({ index: z.number().int().nonnegative(), matches: z.boolean() }).strict()
        ),
        matches: z.boolean(),
        repositoryInScope: z.boolean(),
    })
    .strict();

/** A raw Linear webhook body; the Server projects and matches it, firing nothing. */
export const linearTriggerPreviewInputSchema = z
    .object({
        payload: z
            .record(z.string(), z.unknown())
            .refine(
                (payload) => new TextEncoder().encode(JSON.stringify(payload)).byteLength < 60_000,
                'Webhook payload must be under 60,000 bytes.'
            ),
    })
    .strict();
export type LinearTriggerPreviewInput = z.infer<typeof linearTriggerPreviewInputSchema>;
export const linearTriggerPreviewResultSchema = z
    .object({
        /** Indexes of the groups that matched. */
        groups: z.array(z.number().int().nonnegative()),
        matched: z.boolean(),
        reason: z.string().min(1).optional(),
    })
    .strict();

/** Webhook create and rotate: the only responses that ever contain a secret. */
export const agentTriggerSecretResultSchema = z
    .object({
        curl: z.string().min(1),
        secret: z.string().min(1),
        trigger: agentWebhookTriggerSchema,
        url: z.string().min(1),
    })
    .strict();

export type AgentTriggerSecretResult = z.infer<typeof agentTriggerSecretResultSchema>;

export const agentTriggerResultSchema = z.object({ trigger: agentTriggerSchema }).strict();

/** A webhook create answers with its secret; a `github` create with the Trigger alone. */
export const agentTriggerCreateResultSchema = z.union([
    agentTriggerSecretResultSchema,
    agentTriggerResultSchema,
]);

export const agentTriggerListSchema = z.object({ triggers: z.array(agentTriggerSchema) }).strict();
export const agentTriggerDeleteResultSchema = z
    .object({ deleted: z.literal(true), id: idSchema })
    .strict();
/**
 * A log read is either the history or one fire, never both and never neither:
 * the `kind` tag makes the empty answer unrepresentable.
 */
export const agentTriggerLogSchema = z.discriminatedUnion('kind', [
    z.object({ fires: z.array(triggerFireSchema), kind: z.literal('fires') }).strict(),
    z.object({ fire: triggerFireDetailSchema, kind: z.literal('fire') }).strict(),
]);

export type AgentTriggerLog = z.infer<typeof agentTriggerLogSchema>;

/** 202 for a new fire; 200 with `duplicate` when an Idempotency-Key replays. */
export const triggerFireAcceptedSchema = z
    .object({
        duplicate: z.literal(true).optional(),
        fireId: idSchema,
        triggerId: idSchema,
        type: z.literal('trigger_fire'),
    })
    .strict();

export type TriggerFireAccepted = z.infer<typeof triggerFireAcceptedSchema>;

export const triggerFireErrorCodeSchema = z.enum([
    'invalid_idempotency_key',
    'payload_too_large',
    'rate_limited',
    'trigger_disabled',
    'trigger_unavailable',
    'unauthorized',
    'unsupported_media_type',
]);

export type TriggerFireErrorCode = z.infer<typeof triggerFireErrorCodeSchema>;

export const triggerFireErrorSchema = z.object({ code: triggerFireErrorCodeSchema }).strict();
