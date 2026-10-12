import {
    type GithubTriggerEventName,
    githubCheckConclusionSchema,
    githubDeploymentStateSchema,
    githubReviewStateSchema,
} from '@haus/api';

export type ChoiceKey = 'conclusions' | 'states';
export type TextKey =
    | 'baseBranches'
    | 'branches'
    | 'checkNames'
    | 'environments'
    | 'labels'
    | 'workflows'
    | 'actors'
    | 'actorsIgnore'
    | 'repositories'
    | 'repositoriesIgnore'
    | 'branchesIgnore'
    | 'baseBranchesIgnore'
    | 'checkNamesIgnore'
    | 'environmentsIgnore'
    | 'workflowsIgnore'
    | 'workflowEvents';

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
const branches = {
    key: 'branches',
    label: 'Branches',
    placeholder: '@default, release/*',
} as const;
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

const sharedTexts: GithubEventSpec['texts'] = [
    { key: 'repositories', label: 'Repository patterns', placeholder: 'acme/*' },
    { key: 'repositoriesIgnore', label: 'Exclude repositories', placeholder: 'acme/archived-*' },
    { key: 'actors', label: 'GitHub senders', placeholder: 'octocat, dependabot[bot]' },
    { key: 'actorsIgnore', label: 'Exclude GitHub senders', placeholder: 'dependabot[bot]' },
];
const excludedKeys = {
    branches: 'branchesIgnore',
    baseBranches: 'baseBranchesIgnore',
    checkNames: 'checkNamesIgnore',
    environments: 'environmentsIgnore',
    workflows: 'workflowsIgnore',
} as const;
export function githubEventTextFields(event: GithubTriggerEventName): GithubEventSpec['texts'] {
    const texts = githubEventSpecs[event].texts;
    const exclusions = texts.flatMap((text) =>
        text.key in excludedKeys
            ? [
                  {
                      ...text,
                      key: excludedKeys[text.key as keyof typeof excludedKeys],
                      label: `Exclude ${text.label.toLowerCase()}`,
                  },
              ]
            : []
    );
    const source: GithubEventSpec['texts'] =
        event === 'workflow_run'
            ? [
                  {
                      key: 'workflowEvents',
                      label: 'Workflow source events',
                      placeholder: 'push, workflow_dispatch',
                  },
              ]
            : [];
    return [...texts, ...exclusions, ...source, ...sharedTexts];
}
