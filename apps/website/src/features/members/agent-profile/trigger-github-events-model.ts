import {
    type GithubTriggerEvent,
    type GithubTriggerEventName,
    githubCheckConclusionSchema,
    githubDeploymentStateSchema,
    githubReviewStateSchema,
    githubTriggerEventSchema,
    githubTriggerFilterValuesMax,
} from '@haus/api';

/**
 * The closed GitHub event vocabulary as the Trigger form presents it
 * (specs/github-triggers.md#events): each event's actions with their default,
 * the enumerated filters offered as choices, and the free-text filters.
 */

type ChoiceKey = 'conclusions' | 'states';
type TextKey = 'baseBranches' | 'branches' | 'checkNames' | 'environments' | 'labels' | 'workflows';

export interface GithubEventSpec {
    actions: readonly string[];
    authors: boolean;
    choices: readonly { key: ChoiceKey; label: string; options: readonly string[] }[];
    defaultActions: readonly string[];
    label: string;
    texts: readonly { key: TextKey; label: string; placeholder: string }[];
}

const conclusions = {
    key: 'conclusions',
    label: 'Conclusions',
    options: githubCheckConclusionSchema.options,
} as const;
const branches = { key: 'branches', label: 'Branches', placeholder: 'main, release' } as const;
const labels = { key: 'labels', label: 'Labels', placeholder: 'bug, needs-review' } as const;

export const githubEventSpecs: Record<GithubTriggerEventName, GithubEventSpec> = {
    check_run: {
        actions: ['created', 'completed'],
        authors: false,
        choices: [conclusions],
        defaultActions: ['completed'],
        label: 'Check runs',
        texts: [branches, { key: 'checkNames', label: 'Check names', placeholder: 'build, lint' }],
    },
    check_suite: {
        actions: ['completed'],
        authors: false,
        choices: [conclusions],
        defaultActions: ['completed'],
        label: 'Check suites',
        texts: [branches],
    },
    deployment_status: {
        actions: [],
        authors: false,
        choices: [{ key: 'states', label: 'States', options: githubDeploymentStateSchema.options }],
        defaultActions: [],
        label: 'Deployment statuses',
        texts: [{ key: 'environments', label: 'Environments', placeholder: 'production' }],
    },
    issues: {
        actions: ['opened', 'reopened', 'closed', 'labeled', 'assigned'],
        authors: true,
        choices: [],
        defaultActions: ['opened'],
        label: 'Issues',
        texts: [labels],
    },
    pull_request: {
        actions: [
            'opened',
            'reopened',
            'closed',
            'synchronize',
            'ready_for_review',
            'review_requested',
            'labeled',
        ],
        authors: true,
        choices: [],
        defaultActions: ['opened'],
        label: 'Pull requests',
        texts: [{ ...branches, key: 'baseBranches', label: 'Base branches' }, labels],
    },
    pull_request_review: {
        actions: ['submitted'],
        authors: true,
        choices: [
            { key: 'states', label: 'Review states', options: githubReviewStateSchema.options },
        ],
        defaultActions: ['submitted'],
        label: 'Pull request reviews',
        texts: [],
    },
    push: {
        actions: [],
        authors: false,
        choices: [],
        defaultActions: [],
        label: 'Pushes',
        texts: [branches],
    },
    release: {
        actions: ['published', 'released', 'prereleased'],
        authors: false,
        choices: [],
        defaultActions: ['published'],
        label: 'Releases',
        texts: [],
    },
    workflow_job: {
        actions: ['queued', 'in_progress', 'completed', 'waiting'],
        authors: false,
        choices: [conclusions],
        defaultActions: ['completed'],
        label: 'Workflow jobs',
        texts: [branches],
    },
    workflow_run: {
        actions: ['requested', 'in_progress', 'completed'],
        authors: false,
        choices: [conclusions],
        defaultActions: ['completed'],
        label: 'Workflow runs',
        texts: [
            branches,
            {
                key: 'workflows',
                label: 'Workflow files',
                placeholder: '.github/workflows/ci.yml',
            },
        ],
    },
};

/** Picker order: CI first, then review flow, then the rest. */
export const githubEventOrder: readonly GithubTriggerEventName[] = [
    'workflow_run',
    'workflow_job',
    'check_suite',
    'check_run',
    'pull_request',
    'pull_request_review',
    'push',
    'issues',
    'release',
    'deployment_status',
];

/** One event entry as the form edits it; filters stay text until submit. */
export interface GithubEventDraft {
    actions: string[];
    authors: 'anyone' | 'collaborators';
    choices: Partial<Record<ChoiceKey, string[]>>;
    event: GithubTriggerEventName;
    texts: Partial<Record<TextKey, string>>;
}

export function createGithubEventDraft(event: GithubTriggerEventName): GithubEventDraft {
    return {
        actions: [...githubEventSpecs[event].defaultActions],
        authors: 'collaborators',
        choices: {},
        event,
        texts: {},
    };
}

/** GitHub vocabulary reads in sentence case: `in_progress` → "In progress". */
export function githubValueLabel(value: string) {
    const words = value.replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export function splitFilterText(value: string) {
    return [
        ...new Set(
            value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
        ),
    ];
}

/**
 * The wire entry for one draft, or null when it cannot be sent: an event with
 * actions needs at least one, and each filter list holds at most twenty values.
 * An empty filter is omitted so it matches anything.
 */
export function githubEventFromDraft(draft: GithubEventDraft): GithubTriggerEvent | null {
    const spec = githubEventSpecs[draft.event];
    const entry: Record<string, unknown> = { event: draft.event };
    if (spec.actions.length > 0) {
        entry.actions = draft.actions;
    }
    if (spec.authors) {
        entry.authors = draft.authors;
    }
    for (const choice of spec.choices) {
        const values = draft.choices[choice.key] ?? [];
        if (values.length > 0) {
            entry[choice.key] = values;
        }
    }
    for (const text of spec.texts) {
        const values = splitFilterText(draft.texts[text.key] ?? '');
        if (values.length > githubTriggerFilterValuesMax) {
            return null;
        }
        if (values.length > 0) {
            entry[text.key] = values;
        }
    }
    const parsed = githubTriggerEventSchema.safeParse(entry);
    return parsed.success ? parsed.data : null;
}

/**
 * What one event entry narrows to, for the detail view's row beside the
 * event's name: "completed · failure · main". An entry with nothing to narrow
 * matches every delivery of its event.
 */
export function githubEventSummary(entry: GithubTriggerEvent) {
    const parts: string[] = [];
    if ('actions' in entry && githubEventSpecs[entry.event].actions.length > 1) {
        parts.push(entry.actions.map(githubValueLabel).join(', ').toLowerCase());
    }
    parts.push(...filterValues(entry));
    return parts.length > 0 ? parts.join(' · ') : 'Any';
}

const summaryFilterKeys = [
    'conclusions',
    'states',
    'branches',
    'baseBranches',
    'labels',
    'workflows',
    'checkNames',
    'environments',
] as const;

function filterValues(entry: GithubTriggerEvent): string[] {
    const values: string[] = [];
    const record: Record<string, unknown> = entry;
    for (const key of summaryFilterKeys) {
        const list = record[key];
        if (Array.isArray(list) && list.length > 0) {
            values.push(list.map(String).join(', '));
        }
    }
    if (record.authors === 'anyone') {
        values.push('any author');
    }
    return values;
}
