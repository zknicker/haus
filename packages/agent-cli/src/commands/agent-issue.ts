import { issuePriorities, issueStates } from '@haus/api';
import { createAgentApiClient } from '../agent-api-client.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import {
    runIssueComment,
    runIssueCreate,
    runIssueLink,
    runIssueList,
    runIssueShow,
    runIssueUpdate,
} from './agent-issue-actions.ts';

const codePositional = '<code>';
const fieldFlags = [
    { description: issueStates.join(', '), name: '--state', valueName: '<state>' },
    { description: issuePriorities.join(', '), name: '--priority', valueName: '<priority>' },
    {
        description: 'me, an @handle, task:<id>, or none',
        name: '--assignee',
        valueName: '<who>',
    },
    { description: 'YYYY-MM-DD, or none to clear it', name: '--due', valueName: '<date>' },
    {
        description: 'The whole label set, as a comma list, or none',
        name: '--labels',
        valueName: '<names>',
    },
    { description: 'The parent Issue code, or none', name: '--parent', valueName: '<code>' },
];
const titleFlag = {
    description: 'Title, up to 500 characters',
    name: '--title',
    valueName: '<text>',
};

export const ISSUE_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus issue create --title "Rotate the signing key" --priority high',
            'printf "Steps to reproduce" | haus issue create --title "Login loops" --assignee me',
        ],
        flags: [titleFlag, ...fieldFlags],
        name: 'create',
        notes: [
            'Files the Issue in your Project with the description piped on stdin. It starts todo and unassigned unless a flag says otherwise.',
        ],
        positionals: [],
        run: (args) => runIssueCreate(args, defaultDeps()),
        summary: 'File an Issue in your Project',
        usage: 'haus issue create --title <text> [--state <state>] [--priority <priority>] [--assignee <who>] [--due <date>] [--labels <names>] [--parent <code>]',
    },
    {
        examples: [
            'haus issue update GEN-12 --state in_progress',
            'haus issue update GEN-12 --assignee me --expect-assignee none',
        ],
        flags: [
            titleFlag,
            {
                description: 'Markdown description, or - to read it from stdin',
                name: '--description',
                valueName: '<text|->',
            },
            ...fieldFlags,
            {
                description:
                    'Write only if the assignee is still this: none, me, an @handle, or task:<id>',
                name: '--expect-assignee',
                valueName: '<who>',
            },
            {
                description: 'Apply only if the Issue is still at this version (show prints it)',
                name: '--expected-version',
                valueName: '<n>',
            },
        ],
        name: 'update',
        notes: [
            'To take an Issue, pass --assignee me --expect-assignee none; if someone holds it, the Server refuses with ISSUE_TAKEN and names them.',
            'Only an explicit --state moves an Issue between states.',
        ],
        positionals: [codePositional],
        run: (args) => runIssueUpdate(args, defaultDeps()),
        summary: 'Edit, move, or assign one Issue',
        usage: 'haus issue update <code> [--title <text>] [--description <text|->] [--state <state>] [--priority <priority>] [--assignee <who>] [--expect-assignee <who>] [--due <date>] [--labels <names>] [--parent <code>] [--expected-version <n>]',
    },
    {
        examples: [
            'haus issue list',
            'haus issue list --project WEB --state todo,in_progress',
            'haus issue list --assignee none',
        ],
        flags: [
            { description: "Every assignee's Issues, not only yours", name: '--all' },
            {
                description: 'me, none, an @handle, or task:<id>',
                name: '--assignee',
                valueName: '<who>',
            },
            {
                description: `Comma list of ${issueStates.join(', ')}`,
                name: '--state',
                valueName: '<states>',
            },
            { description: "One Project's Issues, by key", name: '--project', valueName: '<KEY>' },
            { description: 'Sub-issues of one Issue', name: '--parent', valueName: '<code>' },
            {
                description: 'Words in the title or description',
                name: '--query',
                valueName: '<text>',
            },
        ],
        name: 'list',
        notes: [
            'Lists your open Issues unless a flag widens it, most urgent then oldest first, at most 50 rows.',
        ],
        positionals: [],
        run: (args) => runIssueList(args, defaultDeps()),
        summary: 'List open Issues assigned to you',
        usage: 'haus issue list [--all] [--assignee <who>] [--state <states>] [--project <KEY>] [--parent <code>] [--query <text>]',
    },
    {
        examples: ['haus issue show GEN-12'],
        flags: [],
        name: 'show',
        notes: [
            'Prints the Issue, its description, sub-issues, pull requests, comments, and newest activity.',
        ],
        positionals: [codePositional],
        run: (args) => runIssueShow(args, defaultDeps()),
        summary: 'Read one Issue',
        usage: 'haus issue show <code>',
    },
    {
        examples: [
            'printf "Fixed in the last deploy." | haus issue comment GEN-12',
            'printf "Agreed." | haus issue comment GEN-12 --reply-to icm_abc',
        ],
        flags: [
            {
                description: 'The comment id this answers',
                name: '--reply-to',
                valueName: '<commentId>',
            },
        ],
        name: 'comment',
        notes: [
            'Reads the comment from stdin. A comment wakes the agent the Issue is assigned to.',
        ],
        positionals: [codePositional],
        run: (args) => runIssueComment(args, defaultDeps()),
        summary: 'Comment on an Issue',
        usage: 'haus issue comment <code> [--reply-to <commentId>]',
    },
    {
        examples: ['haus issue link GEN-12 --task tsk_abc'],
        flags: [{ description: 'The Task id', name: '--task', valueName: '<id>' }],
        name: 'link',
        positionals: [codePositional],
        run: (args) => runIssueLink(args, defaultDeps(), 'link'),
        summary: 'Link a Task to an Issue',
        usage: 'haus issue link <code> --task <id>',
    },
    {
        examples: ['haus issue unlink GEN-12 --task tsk_abc'],
        flags: [{ description: 'The Task id', name: '--task', valueName: '<id>' }],
        name: 'unlink',
        positionals: [codePositional],
        run: (args) => runIssueLink(args, defaultDeps(), 'unlink'),
        summary: 'Unlink a Task from an Issue',
        usage: 'haus issue unlink <code> --task <id>',
    },
];

function defaultDeps() {
    return {
        client: createAgentApiClient(),
        readStdin: readAgentStdin,
        stdinIsTty: process.stdin.isTTY === true,
        write: (text: string) => process.stdout.write(text),
    };
}
