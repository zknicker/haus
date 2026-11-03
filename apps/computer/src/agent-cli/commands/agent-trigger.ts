import { githubTriggerEventNameSchema } from '@haus/api';
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
import { runTriggerPreview, runTriggerUpdate } from './agent-trigger-edit.ts';
import { GITHUB_CREATE_FLAGS } from './agent-trigger-flags.ts';

export * from './agent-trigger-actions.ts';

// Family 9 — Triggers (ADR 0027, ADR 0045). Agent-owned wakes anchored to a
// message: an outside system POSTs to a private URL (webhook) or a GitHub App
// delivery matches (github). Never scheduled — time-based work stays with reminders.

const idFlag = {
    description: 'Trigger id from haus trigger list',
    name: '--id',
    valueName: '<id>',
};

export const TRIGGER_SUBCOMMANDS: SubCommand[] = [
    {
        name: 'update',
        summary: 'Edit your trigger without replacing its anchor or history',
        usage: 'haus trigger update --id <id> [--title <text>] [--instruction <text>] [(--repo <owner/name> | --org <login>) (--event <name> | --events-json <json>) [filters]]',
        examples: [
            'haus trigger update --id trg_123 --org acme --event workflow_run --branch @default --exclude-repo acme/archived-* --conclusion failure',
        ],
        notes: [
            'GitHub filters replace the entire GitHub configuration. Include --org or --repo and all desired groups.',
            'An empty --instruction clears it. Omitted fields stay unchanged.',
        ],
        flags: [
            idFlag,
            { name: '--title', description: 'New title', valueName: '<text>' },
            {
                name: '--instruction',
                description: 'New instruction; empty clears it',
                valueName: '<text>',
            },
            ...GITHUB_CREATE_FLAGS,
        ],
        positionals: [],
        run: (args) => runTriggerUpdate(args, defaultTriggerDeps()),
    },
    {
        name: 'preview',
        summary: 'Check a webhook payload against your GitHub trigger without firing it',
        usage: 'haus trigger preview --id <id> --event <name> --payload-file <path>',
        examples: [
            'haus trigger preview --id trg_123 --event workflow_run --payload-file delivery.json',
        ],
        flags: [
            idFlag,
            { name: '--event', description: 'GitHub webhook event name', valueName: '<name>' },
            {
                name: '--payload-file',
                description: 'Raw webhook JSON object, under 60,000 bytes',
                valueName: '<path>',
            },
        ],
        notes: [
            'Reports repository scope and each match group. Does not check runtime readiness or record a fire.',
        ],
        positionals: [],
        run: (args) => runTriggerPreview(args, defaultTriggerDeps()),
    },
    {
        examples: [
            'haus trigger create --title "deploy finished" --message-id 1a2b3c4d',
            'haus trigger create --title "sentry alert" --message-id 1a2b3c4d --instruction "Summarize the error in this thread and open a task when it is new."',
            'haus trigger create --kind github --title "CI failed on main" --message-id 1a2b3c4d --repo acme/api --event workflow_run --conclusion failure --branch main',
            'haus trigger create --kind github --title "new PRs" --message-id 1a2b3c4d --org acme --event pull_request --action opened --action ready_for_review',
        ],
        notes: [
            'A webhook prints its URL and secret once. Never post the secret in any chat.',
            'A github Trigger has no URL or secret. --repo or --org names one GitHub account; the Server picks its Haus GitHub App installation, and a refusal names the accounts you can use.',
            `Events: ${githubTriggerEventNameSchema.options.join(', ')}. Comment events are not available.`,
            'Filter flags apply to every listed event that takes them and repeat or take commas:',
            '  --action: every event but push and deployment_status (default per event, e.g. completed, opened)',
            '  --conclusion: workflow_run, workflow_job, check_suite, check_run',
            '  --branch: those four, push, and pull_request (its base branch)',
            '  --state: deployment_status, pull_request_review   --environment: deployment_status',
            '  --label: pull_request, issues   --workflow: workflow_run (file path)   --check-name: check_run',
            '  --authors: pull_request, pull_request_review, issues (default collaborators)',
            'Name filters support * within a path segment, ** across /, and ? for one character. Branch @default follows the repository default branch.',
            'Use --exclude-branch, --exclude-workflow, --exclude-check-name, --exclude-environment, --exclude-repo, or --exclude-actor. Exclusions win inside each group.',
            '--actor filters sender.login; --workflow-event filters workflow_run.event (e.g. push). --match-repo filters full owner/name within the authorized scope.',
            '--events-json replaces event/filter flags with up to 10 OR groups, including repeated event names. Keys are camelCase fields (conclusions, branchesIgnore, repositoriesIgnore, ...); an unknown key fails with the keys its event takes:',
            '  [{"event":"workflow_run","conclusions":["failure"],"branches":["main"]},{"event":"push","branchesIgnore":["release/**"]}]',
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
