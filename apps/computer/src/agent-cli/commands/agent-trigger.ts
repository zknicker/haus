import type { CliFlag } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import {
    defaultTriggerDeps,
    runTriggerCreate,
    runTriggerDelete,
    runTriggerList,
    runTriggerLog,
    runTriggerRotate,
    runTriggerShow,
    runTriggerStatus,
} from './agent-trigger-actions.ts';

export * from './agent-trigger-actions.ts';

// Family 9 — Triggers (ADR 0027, ADR 0045). Agent-owned wakes anchored to a
// message: an outside system POSTs to a private URL (webhook) or a GitHub App
// delivery matches (github). Never scheduled — time-based work stays with reminders.

const idFlag = {
    description: 'Trigger id from haus trigger list',
    name: '--id',
    valueName: '<id>',
};

const GITHUB_CREATE_FLAGS: CliFlag[] = [
    {
        description: 'github: a repository to watch (repeatable)',
        name: '--repo',
        valueName: '<owner/name>',
    },
    {
        description: 'github: every repository you can reach in this account',
        name: '--org',
        valueName: '<login>',
    },
    {
        description: 'github: event to listen to (repeatable)',
        name: '--event',
        valueName: '<name>',
    },
    { description: 'github: event action filter', name: '--action', valueName: '<action>' },
    {
        description: 'github: check or workflow conclusion, e.g. failure',
        name: '--conclusion',
        valueName: '<value>',
    },
    { description: 'github: branch filter', name: '--branch', valueName: '<branch>' },
    { description: 'github: label filter', name: '--label', valueName: '<label>' },
    { description: 'github: deployment or review state', name: '--state', valueName: '<state>' },
    { description: 'github: deployment environment', name: '--environment', valueName: '<name>' },
    { description: 'github: workflow file path', name: '--workflow', valueName: '<path>' },
    { description: 'github: check run name', name: '--check-name', valueName: '<name>' },
    {
        description: 'github: collaborators (default) or anyone',
        name: '--authors',
        valueName: '<who>',
    },
];

export const TRIGGER_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus trigger create --title "deploy finished" --message-id 1a2b3c4d',
            'haus trigger create --title "sentry alert" --message-id 1a2b3c4d --instruction "Summarize the error in this thread and open a task when it is new."',
            'haus trigger create --kind github --title "CI failed on main" --message-id 1a2b3c4d --repo acme/api --event workflow_run --conclusion failure --branch main',
            'haus trigger create --kind github --title "new PRs" --message-id 1a2b3c4d --org acme --event pull_request --action opened --action ready_for_review',
        ],
        notes: [
            'A webhook prints its URL and secret once. Never post the secret in any chat.',
            'A github Trigger has no URL or secret. Run haus github installations first; comment events are not available.',
            'Filter flags apply to every listed event that takes them and repeat or take commas:',
            '  --action: every event but push and deployment_status (default per event, e.g. completed, opened)',
            '  --conclusion: workflow_run, workflow_job, check_suite, check_run',
            '  --branch: those four, push, and pull_request (its base branch)',
            '  --state: deployment_status, pull_request_review   --environment: deployment_status',
            '  --label: pull_request, issues   --workflow: workflow_run (file path)   --check-name: check_run',
            '  --authors: pull_request, pull_request_review, issues (default collaborators)',
        ],
        flags: [
            {
                description: 'What the outside event means, in action language',
                name: '--title',
                valueName: '<text>',
            },
            {
                description: 'Anchor message id (msg= from the message that asked for it)',
                name: '--message-id',
                valueName: '<id>',
            },
            {
                description: 'Standing instruction replayed to you on every fire',
                name: '--instruction',
                valueName: '<text>',
            },
            {
                description: 'webhook (default) or github',
                name: '--kind',
                valueName: '<kind>',
            },
            ...GITHUB_CREATE_FLAGS,
        ],
        name: 'create',
        positionals: [],
        run: (args) => runTriggerCreate(args, defaultTriggerDeps()),
        summary: 'Create a webhook or GitHub Trigger that wakes you when an outside event happens',
        usage: 'haus trigger create --title <text> --message-id <id> [--instruction <text>] [--kind github (--repo <owner/name>... | --org <login>) --event <name>... [filters]]',
    },
    {
        examples: ['haus trigger list'],
        flags: [],
        name: 'list',
        positionals: [],
        run: (args) => runTriggerList(args, defaultTriggerDeps()),
        summary: 'List your triggers with their URLs or GitHub scope, events, and problems',
        usage: 'haus trigger list',
    },
    {
        examples: ['haus trigger show --id trg_1a2b3c4d5e6f'],
        flags: [idFlag],
        name: 'show',
        positionals: [],
        run: (args) => runTriggerShow(args, defaultTriggerDeps()),
        summary: 'Show one trigger, including its standing instruction',
        usage: 'haus trigger show --id <id>',
    },
    {
        examples: ['haus trigger disable --id trg_1a2b3c4d5e6f'],
        flags: [idFlag],
        name: 'disable',
        positionals: [],
        run: (args) => runTriggerStatus(args, defaultTriggerDeps(), 'disable'),
        summary: 'Stop a trigger from firing without deleting its history',
        usage: 'haus trigger disable --id <id>',
    },
    {
        examples: ['haus trigger enable --id trg_1a2b3c4d5e6f'],
        flags: [idFlag],
        name: 'enable',
        positionals: [],
        run: (args) => runTriggerStatus(args, defaultTriggerDeps(), 'enable'),
        summary: 'Arm a disabled trigger again',
        usage: 'haus trigger enable --id <id>',
    },
    {
        examples: ['haus trigger rotate --id trg_1a2b3c4d5e6f'],
        flags: [idFlag],
        name: 'rotate',
        positionals: [],
        run: (args) => runTriggerRotate(args, defaultTriggerDeps()),
        summary: 'Mint a new webhook secret and invalidate the old one (github Triggers have none)',
        usage: 'haus trigger rotate --id <id>',
    },
    {
        examples: ['haus trigger delete --id trg_1a2b3c4d5e6f'],
        flags: [idFlag],
        name: 'delete',
        positionals: [],
        run: (args) => runTriggerDelete(args, defaultTriggerDeps()),
        summary: 'Remove a trigger while retaining its recent fire history',
        usage: 'haus trigger delete --id <id>',
    },
    {
        examples: [
            'haus trigger log --id trg_1a2b3c4d5e6f',
            'haus trigger log --id trg_1a2b3c4d5e6f --limit 10',
            'haus trigger log --id trg_1a2b3c4d5e6f --fire fir_9f8e7d6c5b4a',
        ],
        flags: [
            idFlag,
            {
                description: 'Read one fire with its full stored payload',
                name: '--fire',
                valueName: '<fireId>',
            },
            {
                description: 'Max fires to show, 1 to 100 (default 50)',
                name: '--limit',
                valueName: '<n>',
            },
        ],
        name: 'log',
        positionals: [],
        run: (args) => runTriggerLog(args, defaultTriggerDeps()),
        summary: 'Read fire history, or one fire with the payload it carried',
        usage: 'haus trigger log --id <id> [--fire <fireId>] [--limit <n>]',
    },
];
