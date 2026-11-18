import * as z from 'zod';
import { idSchema } from './chat.ts';

const manualTopicIdPattern = /^[A-Za-z0-9][A-Za-z0-9_/-]{0,127}$/u;

export const agentManualTopicIdSchema = idSchema
    .max(128)
    .regex(manualTopicIdPattern, 'Manual topic ids must be stable path-safe ids.');

export const agentManualIntentSchema = z.string().trim().min(12).max(500);
export const agentManualReasonSchema = z.string().trim().min(12).max(500);

export const agentManualTopicKindSchema = z.enum(['index', 'overview', 'recipe-index', 'recipe']);

export const agentManualRecipeClassSchema = z.enum([
    'archetype',
    'decision',
    'pattern',
    'playbook',
    'technique',
]);
export const agentManualDeliveryTierSchema = z.enum(['seeded', 'query']);

const manualTopicCommonFields = {
    body: z.string().min(1),
    id: agentManualTopicIdSchema,
    related: z.array(agentManualTopicIdSchema),
    summary: z.string().min(1).max(500),
    title: z.string().min(1).max(300),
};

const agentManualIndexTopicSchema = z
    .object({ ...manualTopicCommonFields, kind: z.literal('index') })
    .strict();
const agentManualOverviewTopicSchema = z
    .object({ ...manualTopicCommonFields, kind: z.literal('overview') })
    .strict();
const agentManualRecipeIndexTopicSchema = z
    .object({ ...manualTopicCommonFields, kind: z.literal('recipe-index') })
    .strict();
const agentManualRecipeTopicSchema = z
    .object({
        ...manualTopicCommonFields,
        class: agentManualRecipeClassSchema,
        evidence: z.literal('verified'),
        industries: z.array(z.string().min(1)),
        kind: z.literal('recipe'),
        prereqs: z.array(z.string().min(1)),
        tier: agentManualDeliveryTierSchema,
        triggers: z.array(z.string().min(1)),
    })
    .strict();

export const agentManualTopicSchema = z.discriminatedUnion('kind', [
    agentManualIndexTopicSchema,
    agentManualOverviewTopicSchema,
    agentManualRecipeIndexTopicSchema,
    agentManualRecipeTopicSchema,
]);

export const agentManualGetResponseSchema = z.object({ topic: agentManualTopicSchema }).strict();

export const agentManualSearchScopeSchema = z.enum(['all', 'recipes']);

const agentManualIndexSearchResultSchema = agentManualIndexTopicSchema
    .omit({ body: true, related: true })
    .strict();
const agentManualOverviewSearchResultSchema = agentManualOverviewTopicSchema
    .omit({ body: true, related: true })
    .strict();
const agentManualRecipeIndexSearchResultSchema = agentManualRecipeIndexTopicSchema
    .omit({ body: true, related: true })
    .strict();
const agentManualRecipeSearchResultSchema = agentManualRecipeTopicSchema
    .omit({ body: true, related: true })
    .strict();

export const agentManualSearchResultSchema = z.discriminatedUnion('kind', [
    agentManualIndexSearchResultSchema,
    agentManualOverviewSearchResultSchema,
    agentManualRecipeIndexSearchResultSchema,
    agentManualRecipeSearchResultSchema,
]);

export const agentManualSearchResponseSchema = z
    .object({
        query: z.string().min(1).max(500),
        results: z.array(agentManualSearchResultSchema).max(20),
        scope: agentManualSearchScopeSchema,
    })
    .strict();

export type AgentManualTopic = z.infer<typeof agentManualTopicSchema>;
export type AgentManualSearchResult = z.infer<typeof agentManualSearchResultSchema>;

export const agentManualGetQuerySchema = z
    .object({
        intent: agentManualIntentSchema,
        reason: agentManualReasonSchema,
        // What the Agent typed, not a stable id: the Server resolves aliases and
        // normalized forms, and answers a miss with the closest topics.
        topic: z.string().trim().min(1).max(200),
    })
    .strict();

export const agentManualSearchQuerySchema = z
    .object({
        intent: agentManualIntentSchema,
        limit: z.coerce.number().int().min(1).max(20).default(20),
        q: z.string().trim().min(1).max(500),
        reason: agentManualReasonSchema,
        scope: agentManualSearchScopeSchema.default('all'),
    })
    .strict();

export const manualRunnerCapability = 'manual' as const;
