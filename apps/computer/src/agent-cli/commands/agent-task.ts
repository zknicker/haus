import { columnCategories } from '@haus/api';
import { createAgentApiClient } from '../agent-api-client.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import {
    runTaskAssign,
    runTaskCreate,
    runTaskList,
    runTaskMove,
    runTaskShow,
    runTaskUpdate,
} from './agent-task-actions.ts';
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
 * Board Tasks (ADR 0051): queued work with a key like SEC-12, separate from `haus claim`, the
 * lock on a message. The Agent API refuses every write here in a heartbeat run.
 */
export const TASK_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus task list',
            'haus task list --category done',
            'haus task list --board SEC',
            'haus task list --assignee @zero --category todo,active',
            'haus task list --all',
        ],
        flags: [
            { description: "Every assignee's Tasks, not only yours", name: '--all' },
            {
                description: "One board's Tasks; lists every assignee unless --assignee narrows it",
                name: '--board',
                valueName: '<key>',
            },
            { description: 'me, none, or an @handle', name: '--assignee', valueName: '<who>' },
            {
                description: `Comma list of ${columnCategories.join(', ')}`,
                name: '--category',
                valueName: '<categories>',
            },
        ],
        name: 'list',
        notes: [
            'Lists your open Tasks (backlog, todo, active) unless a flag widens it, most urgent then oldest first, at most 50 rows: the first row is the next one to take.',
        ],
        positionals: [],
        run: (args) => runTaskList(args, defaultDeps()),
        summary: 'List your open Tasks in the order to work them',
        usage: 'haus task list [--all] [--board <key>] [--assignee <me|none|@handle>] [--category <categories>]',
    },
    {
        examples: ['haus task show SEC-12'],
        flags: [],
        name: 'show',
        notes: [
            "Prints the Task, its board's columns, its description, the messages that mention it, and its Reminders.",
        ],
        positionals: [keyPositional],
        run: (args) => runTaskShow(args, defaultDeps()),
        summary: 'Read one Task and what references it',
        usage: 'haus task show <key>',
    },
    {
        examples: [
            'haus task create --board SEC --title "Rotate the signing key" --priority high --assignee @kit',
            'haus task create --board SEC --title "Audit the webhook secrets" --description - <<\'HAUSMSG\'\nStart with the GitHub deliveries.\nHAUSMSG',
        ],
        flags: [
            { description: 'Board key, like SEC', name: '--board', valueName: '<key>' },
            titleFlag,
            descriptionFlag,
            {
                description: 'A column on the board; defaults to its first todo column',
                name: '--column',
                valueName: '<name>',
            },
            { description: 'me or an @handle', name: '--assignee', valueName: '<who>' },
            priorityFlag,
            { description: 'Comma list of label names', name: '--labels', valueName: '<names>' },
            {
                description: 'Display-only due date, YYYY-MM-DD',
                name: '--due',
                valueName: '<date>',
            },
        ],
        name: 'create',
        notes: [
            'Not idempotent: if a create goes unanswered, check haus task list before repeating it.',
        ],
        positionals: [],
        run: (args) => runTaskCreate(args, defaultDeps()),
        summary: 'Create one Task on a board',
        usage: 'haus task create --board <key> --title <text> [--description <text|->] [--column <name>] [--assignee <me|@handle>] [--priority <priority>] [--labels <names>] [--due <date>]',
    },
    {
        examples: [
            'haus task move SEC-12 --column "In progress"',
            'haus task move SEC-12 --column Done',
        ],
        flags: [
            {
                description: "A column on the Task's board, by name in any case",
                name: '--column',
                valueName: '<name>',
            },
            expectedVersionFlag,
        ],
        name: 'move',
        notes: ['A move into a done or canceled column prints what is still assigned to you.'],
        positionals: [keyPositional],
        run: (args) => runTaskMove(args, defaultDeps()),
        summary: 'Move one Task to another column on its board',
        usage: 'haus task move <key> --column <name> [--expected-version <n>]',
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
            'A person or an Agent can hold a Task. An Agent you assign is woken; a person gets it in their Inbox.',
        ],
        positionals: [keyPositional, '<handle|me|none>'],
        run: (args) => runTaskAssign(args, defaultDeps()),
        summary: 'Assign a Task to a person or Agent, or unassign it',
        usage: 'haus task assign <key> <handle|me|none> [--expected-version <n>]',
    },
];

function defaultDeps(): TaskDeps {
    return {
        client: createAgentApiClient(),
        readStdin: readAgentStdin,
        write: (text) => process.stdout.write(text),
    };
}
