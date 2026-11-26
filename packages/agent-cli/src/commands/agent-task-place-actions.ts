import type * as z from 'zod';
import { AgentCliError } from '../agent-error.ts';
import { formatHistoryLine, shortMessageId } from '../agent-format.ts';
import type { ParsedArgs } from '../parse.ts';
import { assertAgentTarget } from './agent-command-utils.ts';
import { positionalTask } from './agent-task-actions.ts';
import {
    describeTask,
    type TaskDeps,
    taskAttachPullRequestSchema,
    taskPlaceLine,
    taskStartSchema,
} from './agent-task-view.ts';

export async function runTaskStart(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = args.values['--target'];
    const from = args.values['--from'];
    if (target !== undefined) {
        assertAgentTarget(target);
    }
    if (from !== undefined && target === undefined) {
        throw new AgentCliError('INVALID_ARG', '--from needs the chat it is in as --target.', {
            nextAction: 'haus task start --target "#security" --from 1a2b3c4d < brief.md',
        });
    }
    const brief = (await deps.readStdin()).trim();
    if (!brief) {
        throw new AgentCliError('INVALID_ARG', 'Give the brief on stdin.', {
            nextAction: 'haus task start --title "Rotate the signing key" < brief.md',
        });
    }
    const response = await deps.client.request('/api/agent/tasks/start', taskStartSchema, {
        body: {
            brief,
            from,
            issue: args.values['--issue'],
            machine: args.values['--machine'],
            model: args.values['--model'],
            ref: args.values['--ref'],
            repo: args.values['--repo'],
            requestId: args.values['--request-id'],
            target,
            title: args.values['--title'],
        },
        method: 'POST',
    });
    if (response.state === 'held') {
        deps.write(renderHeldStart(target ?? 'the chat', response));
        return 0;
    }
    deps.write(
        [
            `Queued ${describeTask(response.task)}`,
            `Its brief posted as its first message, and its first turn is queued. Task target: ${response.target}`,
            ...(from && target
                ? [`Started from message ${shortMessageId(from)} in ${target}.`]
                : []),
            '',
        ].join('\n')
    );
    return 0;
}

function renderHeldStart(target: string, held: Extract<TaskStartResponse, { state: 'held' }>) {
    const lines = [
        `Freshness hold: showing latest ${held.shownMessages.length} of ${held.newMessageCount} newer messages.`,
        ...(held.omittedMessageCount > 0
            ? [
                  `${held.omittedMessageCount} earlier newer messages were omitted. Use haus message read --target "${target}" to review them.`,
              ]
            : []),
        'The Task was not started: nothing was recorded. Review this context.',
        '',
        ...held.shownMessages.map(formatHistoryLine),
        '',
        'If the Task is still right, run the same haus task start again. If the newer messages change the brief, start it with the new brief or skip it.',
    ];
    return `${lines.join('\n')}\n`;
}

type TaskStartResponse = z.infer<typeof taskStartSchema>;

export async function runTaskAttachPullRequest(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const url = args.positionals[1]?.trim();
    if (!url) {
        throw new AgentCliError('INVALID_ARG', 'Give the pull request URL after the Task id.', {
            nextAction: 'haus task attach-pr k3mq7xta https://github.com/owner/repo/pull/12',
        });
    }
    const { pullRequest, task } = await deps.client.request(
        '/api/agent/tasks/attach-pr',
        taskAttachPullRequestSchema,
        { body: { task: positionalTask(args), url }, method: 'POST' }
    );
    deps.write(
        [
            `Attached ${pullRequest.repository}#${pullRequest.number} to ${task.shortId}. When it becomes ready for review or its checks finish, Haus wakes you on the Task.`,
            taskPlaceLine(task.shortId),
            '',
        ].join('\n')
    );
    return 0;
}
