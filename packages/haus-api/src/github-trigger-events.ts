import * as z from 'zod';

// The closed `github` Trigger vocabulary (specs/github-triggers.md#events):
// which deliveries a Trigger may listen to, the filters each one takes, the
// App permission each one needs, and the problems a Trigger can be in.

/** Event entries on one Trigger, at most one per event name. */
export const githubTriggerEventsMax = 10;
/** Values in one filter list. */
export const githubTriggerFilterValuesMax = 20;
/** Selected repositories on one Trigger. */
export const githubTriggerRepositoriesMax = 50;
/** Undeleted `github` Triggers on one installation. */
export const githubTriggerInstallationCap = 25;

export const githubTriggerEventNameSchema = z.enum([
    'workflow_run',
    'workflow_job',
    'check_suite',
    'check_run',
    'deployment_status',
    'pull_request',
    'pull_request_review',
    'push',
    'issues',
    'release',
]);
export type GithubTriggerEventName = z.infer<typeof githubTriggerEventNameSchema>;

/** The GitHub App permission (installation `permissions` key) each event needs. */
export const githubTriggerEventPermission = {
    check_run: 'checks',
    check_suite: 'checks',
    deployment_status: 'deployments',
    issues: 'issues',
    pull_request: 'pull_requests',
    pull_request_review: 'pull_requests',
    push: 'contents',
    release: 'contents',
    workflow_job: 'actions',
    workflow_run: 'actions',
} as const satisfies Record<GithubTriggerEventName, string>;
export type GithubTriggerPermission = (typeof githubTriggerEventPermission)[GithubTriggerEventName];

export const githubCheckConclusionSchema = z.enum([
    'action_required',
    'cancelled',
    'failure',
    'neutral',
    'skipped',
    'stale',
    'startup_failure',
    'success',
    'timed_out',
]);
export const githubDeploymentStateSchema = z.enum([
    'error',
    'failure',
    'inactive',
    'in_progress',
    'pending',
    'queued',
    'success',
]);
export const githubReviewStateSchema = z.enum([
    'approved',
    'changes_requested',
    'commented',
    'dismissed',
]);
/** `collaborators` means `author_association` is OWNER, MEMBER, or COLLABORATOR. */
export const githubTriggerAuthorsSchema = z.enum(['collaborators', 'anyone']);

const filterText = z.string().trim().min(1).max(255);

function filterList<T extends z.ZodType>(item: T) {
    return z.array(item).min(1).max(githubTriggerFilterValuesMax).optional();
}

/** An absent `actions` list takes the event's default, never "any action". */
function actionList<const Options extends readonly [string, ...string[]]>(
    options: Options,
    defaults: [Options[number], ...Options[number][]]
) {
    return z
        .array(z.enum(options))
        .min(1)
        .max(options.length)
        .default(() => [...defaults]);
}

const authors = githubTriggerAuthorsSchema.default('collaborators');
const branches = filterList(filterText);
const conclusions = filterList(githubCheckConclusionSchema);
const labels = filterList(filterText);

export const githubTriggerEventSchema = z.discriminatedUnion('event', [
    z
        .object({
            actions: actionList(['requested', 'in_progress', 'completed'], ['completed']),
            branches,
            conclusions,
            event: z.literal('workflow_run'),
            /** Workflow file paths, such as `.github/workflows/ci.yml`. */
            workflows: filterList(filterText),
        })
        .strict(),
    z
        .object({
            actions: actionList(['queued', 'in_progress', 'completed', 'waiting'], ['completed']),
            branches,
            conclusions,
            event: z.literal('workflow_job'),
        })
        .strict(),
    z
        .object({
            actions: actionList(['completed'], ['completed']),
            branches,
            conclusions,
            event: z.literal('check_suite'),
        })
        .strict(),
    z
        .object({
            actions: actionList(['created', 'completed'], ['completed']),
            branches,
            checkNames: filterList(filterText),
            conclusions,
            event: z.literal('check_run'),
        })
        .strict(),
    z
        .object({
            environments: filterList(filterText),
            event: z.literal('deployment_status'),
            states: filterList(githubDeploymentStateSchema),
        })
        .strict(),
    z
        .object({
            actions: actionList(
                [
                    'opened',
                    'reopened',
                    'closed',
                    'synchronize',
                    'ready_for_review',
                    'review_requested',
                    'labeled',
                ],
                ['opened']
            ),
            authors,
            baseBranches: branches,
            event: z.literal('pull_request'),
            labels,
        })
        .strict(),
    z
        .object({
            actions: actionList(['submitted'], ['submitted']),
            authors,
            event: z.literal('pull_request_review'),
            states: filterList(githubReviewStateSchema),
        })
        .strict(),
    z.object({ branches, event: z.literal('push') }).strict(),
    z
        .object({
            actions: actionList(
                ['opened', 'reopened', 'closed', 'labeled', 'assigned'],
                ['opened']
            ),
            authors,
            event: z.literal('issues'),
            labels,
        })
        .strict(),
    z
        .object({
            actions: actionList(['published', 'released', 'prereleased'], ['published']),
            event: z.literal('release'),
        })
        .strict(),
]);
export type GithubTriggerEvent = z.infer<typeof githubTriggerEventSchema>;

/** One to ten entries, OR across entries, at most one entry per event name. */
export const githubTriggerEventsSchema = z
    .array(githubTriggerEventSchema)
    .min(1)
    .max(githubTriggerEventsMax)
    .refine(
        (events) => new Set(events.map((entry) => entry.event)).size === events.length,
        'List each GitHub event at most once.'
    );
export type GithubTriggerEvents = z.infer<typeof githubTriggerEventsSchema>;

/** A repository as GitHub names it: `owner/name`. */
export const githubRepositoryFullNameSchema = z
    .string()
    .trim()
    .max(200)
    .regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/u, 'Name a repository as owner/name.');

/**
 * Which repositories a Trigger sees. `installation` means every repository the
 * connection's GitHub user can access in the installation.
 */
export const githubTriggerRepositoriesSchema = z.discriminatedUnion('scope', [
    z.object({ scope: z.literal('installation') }).strict(),
    z
        .object({
            names: z
                .array(githubRepositoryFullNameSchema)
                .min(1)
                .max(githubTriggerRepositoriesMax)
                .refine(
                    (names) =>
                        new Set(names.map((name) => name.toLowerCase())).size === names.length,
                    'List each repository at most once.'
                ),
            scope: z.literal('repositories'),
        })
        .strict(),
]);
export type GithubTriggerRepositories = z.infer<typeof githubTriggerRepositoriesSchema>;

/** Why an armed `github` Trigger is not firing (specs/github-triggers.md#failure-modes). */
export const githubTriggerProblemSchema = z.enum([
    'installation_removed',
    'installation_suspended',
    'repositories_unavailable',
    'permissions_missing',
    'agent_access_revoked',
    'sign_in_required',
]);
export type GithubTriggerProblem = z.infer<typeof githubTriggerProblemSchema>;

/** What a `github` Trigger listens to, as create and update send it. */
export const githubTriggerConfigInputSchema = z
    .object({
        events: githubTriggerEventsSchema,
        /** The Haus installation row id (`ghi_…`), not GitHub's numeric id. */
        installationId: z.string().trim().min(1),
        repositories: githubTriggerRepositoriesSchema,
    })
    .strict();
export type GithubTriggerConfigInput = z.infer<typeof githubTriggerConfigInputSchema>;

/** The `github` block of a wire `github` Trigger. */
export const githubTriggerViewSchema = z
    .object({
        events: githubTriggerEventsSchema,
        installationId: z.string().min(1),
        installationLogin: z.string().min(1),
        problem: githubTriggerProblemSchema.nullable(),
        problemSince: z.iso.datetime({ offset: true }).nullable(),
        repositories: githubTriggerRepositoriesSchema,
        suppressedCount: z.number().int().nonnegative(),
    })
    .strict();
export type GithubTriggerView = z.infer<typeof githubTriggerViewSchema>;
