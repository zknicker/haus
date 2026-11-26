import {
    agentIssueCommentResponseSchema,
    agentIssueListResponseSchema,
    agentIssueShowResponseSchema,
    agentIssueSingleResponseSchema,
    ISSUE_CODE_PATTERN,
    issueStates,
} from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { optionalInteger, requiredValue, valuesFor } from './agent-command-utils.ts';
import {
    commentLine,
    describeIssue,
    formatIssueDetail,
    type IssueDeps,
} from './agent-issue-view.ts';

export async function runIssueCreate(args: ParsedArgs, deps: IssueDeps) {
    const description = deps.stdinIsTty ? '' : (await deps.readStdin()).trim();
    const { issue } = await deps.client.request(
        '/api/agent/issues/create',
        agentIssueSingleResponseSchema,
        {
            body: {
                ...fieldValues(args),
                ...(description ? { description } : {}),
                title: requiredValue(args, '--title'),
            },
            method: 'POST',
        }
    );
    deps.write(`Created ${describeIssue(issue)}\n`);
    return 0;
}

export async function runIssueUpdate(args: ParsedArgs, deps: IssueDeps) {
    const description =
        args.values['--description'] === '-'
            ? (await deps.readStdin()).trim()
            : args.values['--description'];
    const fields = {
        ...fieldValues(args),
        ...(description === undefined ? {} : { description }),
        ...(args.values['--title'] === undefined ? {} : { title: args.values['--title'] }),
    };
    if (Object.keys(fields).length === 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide at least one of --title, --description, --state, --priority, --assignee, --due, --labels, or --parent.'
        );
    }
    const expectAssignee = args.values['--expect-assignee'];
    const { issue } = await deps.client.request(
        '/api/agent/issues/update',
        agentIssueSingleResponseSchema,
        {
            body: {
                ...fields,
                code: codeArgument(args),
                ...(expectAssignee === undefined
                    ? {}
                    : { expectAssignee: noneToNull(assigneeRef(expectAssignee)) }),
                expectedVersion: optionalInteger(args, '--expected-version', { minimum: 1 }),
            },
            method: 'POST',
        }
    );
    deps.write(`Updated ${describeIssue(issue)}\n`);
    return 0;
}

export async function runIssueList(args: ParsedArgs, deps: IssueDeps) {
    const query = listQuery(args);
    const { issues, omitted } = await deps.client.request(
        '/api/agent/issues',
        agentIssueListResponseSchema,
        { method: 'GET', query }
    );
    const mine = query.assignee === 'me';
    if (issues.length === 0) {
        deps.write(mine ? 'No open Issues assigned to you.\n' : 'No Issues match.\n');
        return 0;
    }
    const total = issues.length + omitted;
    const heading = `${total} ${total === 1 ? 'Issue' : 'Issues'}${mine ? ' assigned to you' : ''}, by priority then age:`;
    const more =
        omitted > 0
            ? [
                  `Truncated: ${omitted} more. Narrow with --project, --assignee, --state, or --query.`,
              ]
            : [];
    deps.write(`${[heading, ...issues.map(describeIssue), ...more].join('\n')}\n`);
    return 0;
}

export async function runIssueShow(args: ParsedArgs, deps: IssueDeps) {
    const detail = await deps.client.request(
        '/api/agent/issues/show',
        agentIssueShowResponseSchema,
        {
            method: 'GET',
            query: { code: codeArgument(args) },
        }
    );
    deps.write(formatIssueDetail(detail));
    return 0;
}

export async function runIssueComment(args: ParsedArgs, deps: IssueDeps) {
    const body = deps.stdinIsTty ? '' : (await deps.readStdin()).trim();
    if (!body) {
        throw new AgentCliError('INVALID_ARG', 'Pipe the comment body on stdin.');
    }
    const replyTo = args.values['--reply-to'];
    const { comment } = await deps.client.request(
        '/api/agent/issues/comment',
        agentIssueCommentResponseSchema,
        {
            body: { body, code: codeArgument(args), ...(replyTo ? { replyTo } : {}) },
            method: 'POST',
        }
    );
    deps.write(`Commented on ${codeArgument(args)}:\n${commentLine(comment)}\n`);
    return 0;
}

export async function runIssueLink(args: ParsedArgs, deps: IssueDeps, verb: 'link' | 'unlink') {
    const taskId = requiredValue(args, '--task');
    const { issue } = await deps.client.request(
        `/api/agent/issues/${verb}`,
        agentIssueSingleResponseSchema,
        { body: { code: codeArgument(args), taskId }, method: 'POST' }
    );
    deps.write(
        `${verb === 'link' ? 'Linked' : 'Unlinked'} task:${taskId} ${verb === 'link' ? 'to' : 'from'} ${issue.code}.\n`
    );
    return 0;
}

function fieldValues(args: ParsedArgs) {
    const { values } = args;
    const labels = commaList(args, '--labels');
    return {
        ...(values['--state'] === undefined ? {} : { state: stateValue(values['--state']) }),
        ...(values['--priority'] === undefined ? {} : { priority: values['--priority'] }),
        ...(values['--assignee'] === undefined
            ? {}
            : { assignee: noneToNull(assigneeRef(values['--assignee'])) }),
        ...(values['--due'] === undefined ? {} : { dueOn: noneToNull(values['--due']) }),
        ...(values['--labels'] === undefined
            ? {}
            : { labels: values['--labels'] === 'none' ? [] : labels }),
        ...(values['--parent'] === undefined ? {} : { parent: noneToNull(values['--parent']) }),
    };
}

function listQuery(args: ParsedArgs) {
    const all = args.flags['--all'] === true;
    const assignee = args.values['--assignee'];
    if (all && assignee) {
        throw new AgentCliError('INVALID_ARG', 'Use --all or --assignee, not both.');
    }
    const states = commaList(args, '--state').map(stateValue);
    const widened = [
        args.values['--project'],
        args.values['--parent'],
        args.values['--query'],
    ].some((value) => value !== undefined);
    return {
        assignee: assignee ? assigneeRef(assignee) : defaultAssignee(all || widened),
        parent: args.values['--parent'],
        project: args.values['--project'],
        query: args.values['--query'],
        state: states.length > 0 ? states.join(',') : undefined,
    };
}

function defaultAssignee(widened: boolean) {
    return widened ? undefined : 'me';
}

function codeArgument(args: ParsedArgs) {
    const code = args.positionals[0]?.trim() ?? '';
    if (!ISSUE_CODE_PATTERN.test(code)) {
        throw new AgentCliError('INVALID_ARG', '<code> needs an Issue code like GEN-12.', {
            nextAction: 'Use the code haus issue create or haus issue list printed.',
        });
    }
    return code;
}

function assigneeRef(value: string) {
    return value === 'me' || value === 'none' || value.startsWith('@') || value.startsWith('task:')
        ? value
        : `@${value}`;
}

function noneToNull(value: string) {
    return value === 'none' ? null : value;
}

function stateValue(value: string) {
    if (!(issueStates as readonly string[]).includes(value)) {
        throw new AgentCliError(
            'INVALID_ARG',
            `Unknown state ${value}. Use ${issueStates.join(', ')}.`
        );
    }
    return value;
}

function commaList(args: ParsedArgs, flag: string) {
    return valuesFor(args, flag).flatMap((value) =>
        value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
    );
}
