import * as z from 'zod';

// The `linear` Trigger vocabulary (specs/linear-triggers.md#events): which
// Linear data changes a Trigger may listen to, the filters each takes, and the
// problems a Trigger can be in. Stored groups hold stable ids; authoring
// groups hold the names, keys, and selectors a person or Agent types, which the
// Server resolves to ids before storing. Provisional until every event row has
// a captured fixture.

/** OR groups on one Trigger; event names may repeat. */
export const linearTriggerGroupsMax = 10;
/** Values in one filter list. */
export const linearTriggerFilterValuesMax = 20;
/** Undeleted `linear` Triggers on one workspace connection. */
export const linearTriggerWorkspaceCap = 25;

/**
 * One physical Linear event per delivery. A label change is an `issue`
 * `update` with `changed: ['labels']`, never a derived event.
 */
export const linearTriggerEventNameSchema = z.enum(['issue', 'comment', 'project']);
export type LinearTriggerEventName = z.infer<typeof linearTriggerEventNameSchema>;

/** Haus names for changed issue fields, mapped from Linear's `updatedFrom` keys. */
export const linearIssueChangedFieldSchema = z.enum([
    'state',
    'delegate',
    'assignee',
    'labels',
    'priority',
    'project',
    'title',
    'description',
    'estimate',
    'dueDate',
]);
export type LinearIssueChangedField = z.infer<typeof linearIssueChangedFieldSchema>;

/** Haus names for changed project fields, mapped from Linear's `updatedFrom` keys. */
export const linearProjectChangedFieldSchema = z.enum([
    'name',
    'description',
    'status',
    'lead',
    'startDate',
    'targetDate',
]);
export type LinearProjectChangedField = z.infer<typeof linearProjectChangedFieldSchema>;

export const linearWorkflowStateTypeSchema = z.enum([
    'triage',
    'backlog',
    'unstarted',
    'started',
    'completed',
    'canceled',
]);
export type LinearWorkflowStateType = z.infer<typeof linearWorkflowStateTypeSchema>;

/** Why an armed `linear` Trigger is not firing, most fundamental first. */
export const linearTriggerProblemSchema = z.enum([
    'workspace_removed',
    'sign_in_required',
    'agent_access_revoked',
    'teams_unavailable',
    'references_unavailable',
]);
export type LinearTriggerProblem = z.infer<typeof linearTriggerProblemSchema>;

const linearIdSchema = z.string().trim().min(1).max(100);
const agentRefSchema = z.object({ agent: z.string().trim().min(1) }).strict();
const filterText = z.string().trim().min(1).max(255);

/** `@self` or `@agent:<handle>`, resolved to a Haus Agent id at authoring. */
export const linearAgentSelectorSchema = z
    .string()
    .trim()
    .regex(/^@(self|agent:[A-Za-z0-9._-]{1,64})$/u, 'Name an Agent as @self or @agent:<handle>.');

/** The value schemas one group family is built from. */
interface GroupValues<Ref extends z.ZodType, AgentRef extends z.ZodType, Actor extends z.ZodType> {
    actor: Actor;
    agent: AgentRef;
    ref: Ref;
}

/** Stored values: Linear ids, Haus Agent ids, or a Linear user id. */
const storedValues = {
    actor: z.union([agentRefSchema, z.object({ linearUser: linearIdSchema }).strict()]),
    agent: agentRefSchema,
    ref: linearIdSchema,
};

/** Authoring values: names, keys, URLs, emails, and Agent selectors. */
const inputValues = {
    actor: filterText,
    agent: linearAgentSelectorSchema,
    ref: filterText,
};

export const linearTriggerGroupSchema = groupSchema(storedValues);
export type LinearTriggerGroup = z.infer<typeof linearTriggerGroupSchema>;

/** One to ten OR groups of stored ids. */
export const linearTriggerGroupsSchema = z
    .array(linearTriggerGroupSchema)
    .min(1)
    .max(linearTriggerGroupsMax);
export type LinearTriggerGroups = z.infer<typeof linearTriggerGroupsSchema>;

export const linearTriggerGroupInputSchema = groupSchema(inputValues);
export type LinearTriggerGroupInput = z.input<typeof linearTriggerGroupInputSchema>;

/** One to ten OR groups as create and update send them. */
export const linearTriggerGroupsInputSchema = z
    .array(linearTriggerGroupInputSchema)
    .min(1)
    .max(linearTriggerGroupsMax);
export type LinearTriggerGroupsInput = z.input<typeof linearTriggerGroupsInputSchema>;

/** What a `linear` Trigger listens to, as create and update send it. */
export const linearTriggerConfigInputSchema = z
    .object({
        connectionId: z.string().trim().min(1),
        groups: linearTriggerGroupsInputSchema,
    })
    .strict();
export type LinearTriggerConfigInput = z.input<typeof linearTriggerConfigInputSchema>;

/**
 * What an Agent sends: the workspace by url key, which the Server resolves to
 * the connection. Omitted, the Server picks the Agent's only granted
 * workspace, or on update keeps the Trigger's current one.
 */
export const agentLinearTriggerConfigInputSchema = z
    .object({
        groups: linearTriggerGroupsInputSchema,
        workspace: z.string().trim().min(1).optional(),
    })
    .strict();
export type AgentLinearTriggerConfigInput = z.input<typeof agentLinearTriggerConfigInputSchema>;

/** A name snapshot per referenced Linear id, used only for rendering. */
export const linearTriggerDisplaySchema = z.record(linearIdSchema, z.string());
export type LinearTriggerDisplay = z.infer<typeof linearTriggerDisplaySchema>;

/** The `linear` block of a wire `linear` Trigger. */
export const linearTriggerViewSchema = z
    .object({
        /** Null once the workspace is removed: a tombstone belongs to no connection. */
        connectionId: z.string().min(1).nullable(),
        display: linearTriggerDisplaySchema,
        groups: linearTriggerGroupsSchema,
        problem: linearTriggerProblemSchema.nullable(),
        problemSince: z.iso.datetime({ offset: true }).nullable(),
        selfSuppressedCount: z.number().int().nonnegative(),
        suppressedCount: z.number().int().nonnegative(),
        workspaceName: z.string().min(1),
    })
    .strict();
export type LinearTriggerView = z.infer<typeof linearTriggerViewSchema>;

function filterList<T extends z.ZodType>(item: T) {
    return z.array(item).min(1).max(linearTriggerFilterValuesMax).optional();
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

function groupSchema<Ref extends z.ZodType, AgentRef extends z.ZodType, Actor extends z.ZodType>(
    values: GroupValues<Ref, AgentRef, Actor>
) {
    const refs = filterList(values.ref);
    const common = {
        actors: filterList(values.actor),
        actorsIgnore: filterList(values.actor),
        assignees: refs,
        delegates: filterList(values.agent),
        labels: refs,
        labelsIgnore: refs,
        projects: refs,
        teams: refs,
    };
    return z.discriminatedUnion('event', [
        z
            .object({
                ...common,
                actions: actionList(['create', 'update', 'remove'], ['create']),
                changed: filterList(linearIssueChangedFieldSchema),
                event: z.literal('issue'),
                stateFrom: refs,
                stateTo: refs,
                stateTypes: filterList(linearWorkflowStateTypeSchema),
            })
            .strict(),
        z
            .object({
                ...common,
                actions: actionList(['create', 'update'], ['create']),
                event: z.literal('comment'),
                onIssueDelegatedTo: filterList(values.agent),
            })
            .strict(),
        z
            .object({
                ...common,
                actions: actionList(['create', 'update'], ['update']),
                changed: filterList(linearProjectChangedFieldSchema),
                event: z.literal('project'),
                projectStatuses: refs,
            })
            .strict(),
    ]);
}
