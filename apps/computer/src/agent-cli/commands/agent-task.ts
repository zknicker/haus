import { taskStates } from '@haus/api';
import { createAgentApiClient } from '../agent-api-client.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import { runTaskAssign, runTaskList, runTaskShow, runTaskUpdate } from './agent-task-actions.ts';
import {
    runTaskAttachPullRequest,
    runTaskStart,
    runTaskState,
} from './agent-task-place-actions.ts';
import { TASK_UNFOLLOW_SUBCOMMAND } from './agent-task-unfollow.ts';
import type { TaskDeps } from './agent-task-view.ts';

const keyPositional = '<key>';
const expectedVersionFlag = {
    description: 'Apply only if the Task is still at this version (show prints it)',
    name: '--expected-version',
    valueName: '<n>',
};
const titleFlag = {
    description: 'Title, up to 200 characters',
    name: '--title',
    valueName: '<text>',
};
const descriptionFlag = {
    description: 'Markdown description, or - to read it from stdin',
    name: '--description',
    valueName: '<text|->',
};
const priorityFlag = {
    description: 'none, urgent, high, medium, or low',
    name: '--priority',
    valueName: '<priority>',
};

/**
 * Tasks (ADR 0052): a place for one piece of work, with a key like SEC-12 and its own
 * conversation at `task:SEC-12`. Separate from `haus claim`, the lock on a message.
 */
export const TASK_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus task start --target "#security" --from 1a2b3c4d --title "Rotate the signing key"',
            'haus task start --target "#security" --from 1a2b3c4d --title "Audit the webhook secrets" --assignee @kit --state todo',
        ],
        flags: [
            {
                description: 'The channel holding the origin message, like #security',
                name: '--target',
                valueName: '<#channel>',
            },
            {
                description: 'The origin message id (msg= from a message in that channel)',
                name: '--from',
                valueName: '<messageId>',
            },
            titleFlag,
            descriptionFlag,
            {
                description: 'me or an @handle; defaults to you',
                name: '--assignee',
                valueName: '<who>',
            },
            { description: 'open (default) or todo', name: '--state', valueName: '<todo|open>' },
            priorityFlag,
            {
                description: 'Display-only due date, YYYY-MM-DD',
                name: '--due',
                valueName: '<date>',
            },
        ],
        name: 'start',
        notes: [
            "A Task starts from a message in a channel, never a DM. It takes that channel's key. Several Tasks may start from one message.",
            'Not idempotent: if a start goes unanswered, check haus task list before repeating it.',
        ],
        positionals: [],
        run: (args) => runTaskStart(args, defaultDeps()),
        summary: 'Start a Task from a message in a channel',
        usage: 'haus task start --target <#channel> --from <messageId> --title <text> [--description <text|->] [--assignee <me|@handle>] [--state <todo|open>] [--priority <priority>] [--due <date>]',
    },
    {
        examples: [
            'haus task list',
            'haus task list --state done',
            'haus task list --key SEC',
            'haus task list --assignee @zero --state todo,open',
            'haus task list --all',
        ],
        flags: [
            { description: "Every assignee's Tasks, not only yours", name: '--all' },
            {
                description: "One key's Tasks; lists every assignee unless --assignee narrows it",
                name: '--key',
                valueName: '<KEY>',
            },
            { description: 'me, none, or an @handle', name: '--assignee', valueName: '<who>' },
            {
                description: `Comma list of ${taskStates.join(', ')}`,
                name: '--state',
                valueName: '<states>',
            },
        ],
        name: 'list',
        notes: [
            'Lists your todo and open Tasks unless a flag widens it, most urgent then oldest first, at most 50 rows.',
        ],
        positionals: [],
        run: (args) => runTaskList(args, defaultDeps()),
        summary: 'List your unfinished Tasks',
        usage: 'haus task list [--all] [--key <KEY>] [--assignee <me|none|@handle>] [--state <states>]',
    },
    {
        examples: ['haus task show SEC-12'],
        flags: [],
        name: 'show',
        notes: [
            'Prints the Task, its target, its description, the messages that mention it, and its Reminders. Read its conversation with haus message read --target task:SEC-12.',
        ],
        positionals: [keyPositional],
        run: (args) => runTaskShow(args, defaultDeps()),
        summary: 'Read one Task and what references it',
        usage: 'haus task show <key>',
    },
    {
        examples: ['haus task state SEC-12 open', 'haus task state SEC-12 done'],
        flags: [expectedVersionFlag],
        name: 'state',
        notes: [
            'done or canceled ends the Task and cancels its pending reminders; a post in it reopens it.',
        ],
        positionals: [keyPositional, '<todo|open|done|canceled>'],
        run: (args) => runTaskState(args, defaultDeps()),
        summary: "Set a Task's state",
        usage: 'haus task state <key> <todo|open|done|canceled> [--expected-version <n>]',
    },
    {
        examples: ['haus task attach-pr SEC-12 https://github.com/haus/haus/pull/12'],
        flags: [],
        name: 'attach-pr',
        notes: [
            'A pull request a cloud agent opens for the Task attaches on its own; use this for one opened another way. Its changes wake you on the Task.',
        ],
        positionals: [keyPositional, '<url>'],
        run: (args) => runTaskAttachPullRequest(args, defaultDeps()),
        summary: 'Attach a GitHub pull request to a Task',
        usage: 'haus task attach-pr <key> <url>',
    },
    {
        examples: [
            'haus task update SEC-12 --priority urgent',
            'haus task update SEC-12 --due none --labels Security,Infra',
        ],
        flags: [
            titleFlag,
            descriptionFlag,
            priorityFlag,
            {
                description: 'The whole label set, as a comma list, or none',
                name: '--labels',
                valueName: '<names>',
            },
            { description: 'YYYY-MM-DD, or none to clear it', name: '--due', valueName: '<date>' },
            expectedVersionFlag,
        ],
        name: 'update',
        positionals: [keyPositional],
        run: (args) => runTaskUpdate(args, defaultDeps()),
        summary: "Edit a Task's title, description, priority, labels, or due date",
        usage: 'haus task update <key> [--title <text>] [--description <text|->] [--priority <priority>] [--labels <names|none>] [--due <date|none>] [--expected-version <n>]',
    },
    {
        examples: [
            'haus task assign SEC-12 @kit',
            'haus task assign SEC-12 me',
            'haus task assign SEC-12 none',
        ],
        flags: [expectedVersionFlag],
        name: 'assign',
        notes: [
            'A person or an Agent can hold a Task, and the assignee follows it. An Agent you assign is woken.',
        ],
        positionals: [keyPositional, '<handle|me|none>'],
        run: (args) => runTaskAssign(args, defaultDeps()),
        summary: 'Assign a Task to a person or Agent, or unassign it',
        usage: 'haus task assign <key> <handle|me|none> [--expected-version <n>]',
    },
    TASK_UNFOLLOW_SUBCOMMAND,
];

function defaultDeps(): TaskDeps {
    return {
        client: createAgentApiClient(),
        readStdin: readAgentStdin,
        write: (text) => process.stdout.write(text),
    };
}
