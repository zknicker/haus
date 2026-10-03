import type { SubCommand } from '../subcommand.ts';
import {
    runTaskClaim,
    runTaskCreate,
    runTaskList,
    runTaskUnclaim,
    runTaskUpdate,
    type TaskDeps,
} from './agent-task-actions.ts';
import { runTaskAssign, runTaskUnassign } from './agent-task-assign.ts';

const statusFlag = {
    description: 'New status: todo|in_progress|in_review|done|closed',
    name: '--status',
    valueName: '<status>',
};
const targetFlag = {
    description: "Channel or DM target, e.g. '#general' or 'dm:@zach'",
    name: '--target',
    valueName: '<target>',
};
const expectedRevisionFlag = {
    description: 'Apply only if the task is still at this revision (rev= in task list)',
    name: '--expected-revision',
    valueName: '<n>',
};
const numberFlag = {
    description: 'Task number (repeatable on claim)',
    name: '--number',
    valueName: '<n>',
};

export function createTaskSubcommands(resolveDeps: () => TaskDeps): SubCommand[] {
    return [
        {
            examples: [
                'haus task list',
                'haus task list --mine',
                'haus task list --target "#general" --status all',
            ],
            flags: [
                targetFlag,
                {
                    description: 'Filter: all|todo|in_progress|in_review|done|closed',
                    name: '--status',
                    valueName: '<status>',
                },
                { description: 'Only tasks claimed by or assigned to you', name: '--mine' },
            ],
            name: 'list',
            notes: [
                'Lists unfinished tasks (todo, in_progress, in_review) unless --status says otherwise, newest activity first, at most 50 rows.',
            ],
            positionals: [],
            run: (args) => runTaskList(args, resolveDeps()),
            summary: 'List task-messages across your chats or one target',
            usage: 'haus task list [--target <target>] [--mine] [--status all|todo|in_progress|in_review|done|closed]',
        },
        {
            examples: [
                'haus task create --target "#general" <<\'HAUSMSG\'\nInvestigate the failing nightly export.\nHAUSMSG',
                'haus task create --target "#general" --title "Phase 1: audit" --title "Phase 2: fix"',
            ],
            flags: [
                targetFlag,
                {
                    description: 'Task body per task (repeatable); otherwise the body is stdin',
                    name: '--title',
                    valueName: '<text>',
                },
                {
                    description:
                        'Assign to an Agent in the target; assigning yourself claims immediately',
                    name: '--assignee',
                    valueName: '<@handle>',
                },
            ],
            name: 'create',
            positionals: [],
            run: (args) => runTaskCreate(args, resolveDeps()),
            summary: 'Post a new message and publish it as a task',
            usage: 'haus task create --target <target> [--title <text>]... [--assignee @agent]',
        },
        {
            examples: [
                'haus task claim --target "#general" --number 1 --number 2',
                'haus task claim --target "#general" --message-id 1a2b3c4d',
            ],
            flags: [
                targetFlag,
                numberFlag,
                {
                    description: 'Claim a regular message: converts it to a task you own',
                    name: '--message-id',
                    valueName: '<id>',
                },
            ],
            name: 'claim',
            notes: [
                'Prints one row per requested task: claimed, already yours, or refused with the reason. Exits non-zero only when nothing was granted.',
            ],
            positionals: [],
            run: (args) => runTaskClaim(args, resolveDeps()),
            summary: 'Claim tasks before working — the claim is the concurrency lock',
            usage: 'haus task claim --target <target> (--number <n>... | --message-id <id>)',
        },
        {
            examples: ['haus task unclaim --target "#general" --number 1'],
            flags: [targetFlag, numberFlag],
            name: 'unclaim',
            positionals: [],
            run: (args) => runTaskUnclaim(args, resolveDeps()),
            summary: 'Release a task you claimed',
            usage: 'haus task unclaim --target <target> --number <n>',
        },
        {
            examples: [
                'haus task assign --target "#general" --number 1 --assignee @kit',
                'haus task assign --target "#general" --number 1 --assignee @scout --expected-revision 3',
            ],
            flags: [
                targetFlag,
                numberFlag,
                {
                    description: 'Agent member of the target to hand the task to',
                    name: '--assignee',
                    valueName: '<@agent>',
                },
                expectedRevisionFlag,
            ],
            name: 'assign',
            notes: [
                'Moves the owner only; status is unchanged and the assignee claims to start. Works on a task someone else holds.',
                'Only Agents hold tasks. To hand work to a human, @mention them in an inline reply where the request arrived.',
            ],
            positionals: [],
            run: (args) => runTaskAssign(args, resolveDeps()),
            summary: 'Hand a task to an Agent member of its chat',
            usage: 'haus task assign --target <target> --number <n> --assignee @agent [--expected-revision <n>]',
        },
        {
            examples: ['haus task unassign --target "#general" --number 1'],
            flags: [targetFlag, numberFlag, expectedRevisionFlag],
            name: 'unassign',
            positionals: [],
            run: (args) => runTaskUnassign(args, resolveDeps()),
            summary: "Clear a task's assignee without changing its status",
            usage: 'haus task unassign --target <target> --number <n> [--expected-revision <n>]',
        },
        {
            examples: ['haus task update --target "#general" --number 1 --status in_review'],
            flags: [targetFlag, numberFlag, statusFlag],
            name: 'update',
            positionals: [],
            run: (args) => runTaskUpdate(args, resolveDeps()),
            summary:
                'Move a task through todo → in_progress → in_review → done (closed is reversible)',
            usage: 'haus task update --target <target> --number <n> --status <status>',
        },
    ];
}
