import {
    agentGithubTriggerSchema,
    agentTriggerDeleteResultSchema,
    agentTriggerSecretResultSchema,
    agentWebhookTriggerSchema,
    githubTriggerEventSchema,
    githubTriggerEventsMax,
    githubTriggerPreviewResultSchema,
    githubTriggerRepositoriesSchema,
    githubTriggerViewSchema,
    triggerFireDetailSchema,
    triggerFireSchema,
} from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` Agent Trigger schemas,
 * loosened at every nested object so an older Computer tolerates a field a
 * newer Server added instead of rejecting the whole response. Those
 * canonical schemas stay strict for the Server's own construction and for
 * validating untrusted request input; only response parsing needs this
 * tolerance.
 */

const [
    workflowRunEvent,
    workflowJobEvent,
    checkSuiteEvent,
    checkRunEvent,
    deploymentStatusEvent,
    pullRequestEvent,
    pullRequestReviewEvent,
    pushEvent,
    issuesEvent,
    releaseEvent,
] = githubTriggerEventSchema.options;

const githubTriggerEventResponseSchema = z.discriminatedUnion('event', [
    z.looseObject(workflowRunEvent.shape),
    z.looseObject(workflowJobEvent.shape),
    z.looseObject(checkSuiteEvent.shape),
    z.looseObject(checkRunEvent.shape),
    z.looseObject(deploymentStatusEvent.shape),
    z.looseObject(pullRequestEvent.shape),
    z.looseObject(pullRequestReviewEvent.shape),
    z.looseObject(pushEvent.shape),
    z.looseObject(issuesEvent.shape),
    z.looseObject(releaseEvent.shape),
]);

const githubTriggerEventsResponseSchema = z
    .array(githubTriggerEventResponseSchema)
    .min(1)
    .max(githubTriggerEventsMax);

const [installationRepositories, namedRepositories] = githubTriggerRepositoriesSchema.options;

const githubTriggerRepositoriesResponseSchema = z.discriminatedUnion('scope', [
    z.looseObject(installationRepositories.shape),
    z.looseObject(namedRepositories.shape),
]);

const githubTriggerViewResponseSchema = z.looseObject({
    ...githubTriggerViewSchema.shape,
    events: githubTriggerEventsResponseSchema,
    repositories: githubTriggerRepositoriesResponseSchema,
});

const agentWebhookTriggerResponseSchema = z.looseObject(agentWebhookTriggerSchema.shape);

const agentGithubTriggerResponseSchema = z.looseObject({
    ...agentGithubTriggerSchema.shape,
    github: githubTriggerViewResponseSchema,
});

const agentTriggerResponseSchema = z.discriminatedUnion('kind', [
    agentWebhookTriggerResponseSchema,
    agentGithubTriggerResponseSchema,
]);

export const agentTriggerResultResponseSchema = z.looseObject({
    trigger: agentTriggerResponseSchema,
});

export const agentTriggerListResponseSchema = z.looseObject({
    triggers: z.array(agentTriggerResponseSchema),
});

export const agentTriggerSecretResultResponseSchema = z.looseObject({
    ...agentTriggerSecretResultSchema.shape,
    trigger: agentWebhookTriggerResponseSchema,
});

export const agentTriggerDeleteResultResponseSchema = z.looseObject(
    agentTriggerDeleteResultSchema.shape
);

const triggerFireResponseSchema = z.looseObject(triggerFireSchema.shape);
const triggerFireDetailResponseSchema = z.looseObject(triggerFireDetailSchema.shape);

export const agentTriggerLogResponseSchema = z.discriminatedUnion('kind', [
    z.looseObject({ fires: z.array(triggerFireResponseSchema), kind: z.literal('fires') }),
    z.looseObject({ fire: triggerFireDetailResponseSchema, kind: z.literal('fire') }),
]);

export const githubTriggerPreviewResultResponseSchema = z.looseObject({
    ...githubTriggerPreviewResultSchema.shape,
    groups: z.array(z.looseObject({ index: z.number().int().nonnegative(), matches: z.boolean() })),
});
