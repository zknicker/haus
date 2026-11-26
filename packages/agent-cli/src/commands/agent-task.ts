import { createAgentApiClient } from '../agent-api-client.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import { runTaskArchive, runTaskList, runTaskShow, runTaskUnarchive } from './agent-task-actions.ts';
import { runTaskAttachPullRequest, runTaskStart } from './agent-task-place-actions.ts';
import { TASK_UNFOLLOW_SUBCOMMAND } from './agent-task-unfollow.ts';
import type { TaskDeps } from './agent-task-view.ts';

const idPositional = '<id>';

export const TASK_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus task start --title "Rotate the signing key" < brief.md',
            'haus task start --target "#security" --from 1a2b3c4d --issue SEC-12 < brief.md',
        ],
        flags: [
            {
                description: 'The chat you are answering in; a newer message there holds the start',
                name: '--target',
                valueName: '<#channel|dm:@handle>',
            },
            {
                description: 'A message in --target that becomes the Task’s origin',
                name: '--from',
                valueName: '<messageId>',
            },
            {
                description: 'Title, up to 200 characters; defaults to a summary of the brief',
                name: '--title',
                valueName: '<text>',
            },
            {
                description: 'The Machine it runs on; defaults to your crew Machine, then the Project’s',
                name: '--machine',
                valueName: '<name>',
            },
            {
                description: 'The model it runs; defaults to your crew model, then your own',
                name: '--model',
                valueName: '<id>',
            },
            {
                description: 'An open Issue in your Project to link and assign to the Task',
                name: '--issue',
                valueName: '<code>',
            },
            {
                description: 'Your own id for this start; repeating it returns the same Task',
                name: '--request-id',
                valueName: '<id>',
            },
        ],
        name: 'start',
        notes: [
            'Starts crew in your home Project: a fresh agent session with its own chat. The brief on stdin is its first message.',
            '--issue never changes the Issue’s state; an Issue someone else holds is refused with ISSUE_TAKEN.',
            'The receipt says the Task is queued, with its short id. Pass --request-id to make a retry safe.',
        ],
        positionals: [],
        run: (args) => runTaskStart(args, defaultDeps()),
        summary: 'Start a crew Task with a brief',
        usage: 'haus task start [--title <text>] [--target <chat>] [--from <messageId>] [--machine <name>] [--model <id>] [--issue <code>] [--request-id <id>] < brief',
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
        examples: ['haus task unarchive k3mq7xta'],
        flags: [
            {
                description: 'Apply only if the Task is still at this version (show prints it)',
                name: '--expected-version',
                valueName: '<n>',
            },
        ],
        name: 'unarchive',
        notes: ['Restoring starts no turn; the next message to the Task wakes a fresh session.'],
        positionals: [idPositional],
        run: (args) => runTaskUnarchive(args, defaultDeps()),
        summary: 'Restore an archived Task',
        usage: 'haus task unarchive <id> [--expected-version <n>]',
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
