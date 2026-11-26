import { createAgentApiClient } from '../agent-api-client.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import { runTaskArchive, runTaskList, runTaskShow } from './agent-task-actions.ts';
import { runTaskAttachPullRequest, runTaskStart } from './agent-task-place-actions.ts';
import { TASK_UNFOLLOW_SUBCOMMAND } from './agent-task-unfollow.ts';
import type { TaskDeps } from './agent-task-view.ts';

const idPositional = '<id>';

export const TASK_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus task start --target "#security" --from 1a2b3c4d --title "Rotate the signing key"',
            'haus task start --target dm:@ada --from 5e6f7a8b --title "Patch the login bug" --project APP',
        ],
        flags: [
            {
                description:
                    'The channel or DM holding the origin message, like #security or dm:@ada',
                name: '--target',
                valueName: '<#channel|dm:@handle>',
            },
            {
                description: 'The origin message id (msg= from a message there)',
                name: '--from',
                valueName: '<messageId>',
            },
            {
                description:
                    "The Project's key, like APP; defaults to the origin's channel, or your Project for a DM or #all",
                name: '--project',
                valueName: '<KEY>',
            },
            { description: 'Title, up to 200 characters', name: '--title', valueName: '<text>' },
            {
                description: 'Markdown description, or - to read it from stdin',
                name: '--description',
                valueName: '<text|->',
            },
        ],
        name: 'start',
        notes: [
            'A Task starts from a message in a channel or DM and gets a short id. Several Tasks may start from one message.',
            'You start Tasks only in your Project; elsewhere the Server refuses with TASK_PROJECT_NOT_HOME.',
            'Not idempotent: if a start goes unanswered, check haus task list before repeating it.',
        ],
        positionals: [],
        run: (args) => runTaskStart(args, defaultDeps()),
        summary: 'Start a Task from a message in a channel or DM',
        usage: 'haus task start --target <#channel|dm:@handle> --from <messageId> --title <text> [--project <KEY>] [--description <text|->]',
    },
    {
        examples: [
            'haus task list',
            'haus task list --all',
            'haus task list --all --project SEC',
            'haus task list --archived',
        ],
        flags: [
            { description: 'Every Task, not only the ones you started', name: '--all' },
            { description: 'Archived Tasks instead of active ones', name: '--archived' },
            {
                description: "One Project's Tasks, by its key",
                name: '--project',
                valueName: '<KEY>',
            },
        ],
        name: 'list',
        notes: [
            'Lists the active Tasks you started unless a flag widens it, newest first, at most 50 rows.',
        ],
        positionals: [],
        run: (args) => runTaskList(args, defaultDeps()),
        summary: 'List the active Tasks you started',
        usage: 'haus task list [--all] [--archived] [--project <KEY>]',
    },
    {
        examples: ['haus task show k3mq7xta'],
        flags: [],
        name: 'show',
        notes: [
            'Prints the Task, its target, its description, the messages that mention it, and its Reminders. Read its conversation with haus message read --target task:k3mq7xta.',
        ],
        positionals: [idPositional],
        run: (args) => runTaskShow(args, defaultDeps()),
        summary: 'Read one Task and what references it',
        usage: 'haus task show <id>',
    },
    {
        examples: ['haus task archive k3mq7xta'],
        flags: [
            {
                description: 'Apply only if the Task is still at this version (show prints it)',
                name: '--expected-version',
                valueName: '<n>',
            },
        ],
        name: 'archive',
        notes: ["Archiving cancels the Task's pending reminders; its chat stays readable."],
        positionals: [idPositional],
        run: (args) => runTaskArchive(args, defaultDeps()),
        summary: 'Archive a Task',
        usage: 'haus task archive <id> [--expected-version <n>]',
    },
    {
        examples: ['haus task attach-pr k3mq7xta https://github.com/haus/haus/pull/12'],
        flags: [],
        name: 'attach-pr',
        notes: [
            'A pull request a Worker opens for the Task attaches on its own; use this for one opened another way. Its changes wake you on the Task.',
        ],
        positionals: [idPositional, '<url>'],
        run: (args) => runTaskAttachPullRequest(args, defaultDeps()),
        summary: 'Attach a GitHub pull request to a Task',
        usage: 'haus task attach-pr <id> <url>',
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
