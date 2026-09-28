import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import {
    type AgentApiRequest,
    type AgentApiRequester,
    createAgentApiClient,
} from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import {
    assigneeLabel,
    claimRefusal,
    formatTaskClaims,
    formatTaskList,
    formatTasksCreated,
    taskClaimResultSchema,
    taskRowSchema,
} from './agent-task-format.ts';

// Family 5 — Tasks (D8). A task is a message with task metadata; claiming is
// the concurrency lock. `task create` posts a fresh message and publishes it
// as a task in one step.

export interface TaskDeps {
    client: AgentApiRequester;
    mintNonce(): string;
    readStdin(): Promise<string>;
    signal?: AbortSignal;
    stdinIsTty(): boolean;
    write(text: string): void;
}

const taskListResponseSchema = z.object({
    omitted: z.number().int().nonnegative(),
    tasks: z.array(taskRowSchema),
});
const taskCreateResponseSchema = z.object({ tasks: z.array(taskRowSchema) });
const taskClaimResponseSchema = z.object({ results: z.array(taskClaimResultSchema).min(1) });
const taskSingleResponseSchema = z.object({ task: taskRowSchema });

export async function runTaskList(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const params = new URLSearchParams();
    const target = args.values['--target'];
    const status = args.values['--status'];
    if (target) {
        params.set('target', target);
    }
    if (status) {
        params.set('status', status);
    }
    if (args.flags['--mine']) {
        params.set('mine', 'true');
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const response = await deps.client.request(
        `/api/agent/tasks${query}`,
        taskListResponseSchema,
        withTaskSignal(deps, { method: 'GET' })
    );
    deps.write(formatTaskList(response.tasks, response.omitted));
    return 0;
}

export async function runTaskCreate(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = requireTarget(args, 'haus task create --target "#channel"');
    const titles = args.valueLists?.['--title'] ?? [];
    let content: string | undefined;
    if (titles.length === 0) {
        if (deps.stdinIsTty()) {
            throw new AgentCliError(
                'MISSING_CONTENT',
                'Task create needs --title flags or a heredoc body on stdin.',
                {
                    nextAction:
                        'haus task create --target "#channel" <<\'HAUSMSG\'\n<task body>\nHAUSMSG',
                }
            );
        }
        content = (await deps.readStdin()).trim();
        if (!content) {
            throw new AgentCliError('MISSING_CONTENT', 'Task body from stdin was empty.');
        }
    }
    const response = await deps.client.request(
        '/api/agent/tasks/create',
        taskCreateResponseSchema,
        withTaskSignal(deps, {
            body: {
                assignee: args.values['--assignee'],
                content,
                nonce: deps.mintNonce(),
                target,
                titles: titles.length > 0 ? titles : undefined,
            },
            method: 'POST',
        })
    );
    deps.write(formatTasksCreated(response.tasks, target));
    return 0;
}

export async function runTaskClaim(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = requireTarget(args, 'haus task claim --target "#channel" --number 1');
    const numbers = (args.valueLists?.['--number'] ?? []).map((value) => parseTaskNumber(value));
    const messageId = args.values['--message-id'];
    if (numbers.length === 0 && !messageId) {
        throw new AgentCliError('INVALID_ARG', 'Pass --number (repeatable) or --message-id.', {
            nextAction: 'haus task claim --target <target> --number <n>',
        });
    }
    const response = await deps.client.request(
        '/api/agent/tasks/claim',
        taskClaimResponseSchema,
        withTaskSignal(deps, {
            body: {
                messageId,
                numbers: numbers.length > 0 ? numbers : undefined,
                target,
            },
            method: 'POST',
        })
    );
    deps.write(formatTaskClaims(response.results, target));
    const refusal = claimRefusal(response.results);
    if (refusal) {
        throw refusal;
    }
    return 0;
}

export async function runTaskUnclaim(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = requireTarget(args, 'haus task unclaim --target "#channel" --number 1');
    const response = await deps.client.request(
        '/api/agent/tasks/unclaim',
        taskSingleResponseSchema,
        withTaskSignal(deps, {
            body: { number: singleNumber(args), target },
            method: 'POST',
        })
    );
    deps.write(
        `Released task #${response.task.number} [${response.task.status}]. It is unassigned and claimable again.\n`
    );
    return 0;
}

export async function runTaskUpdate(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = requireTarget(
        args,
        'haus task update --target "#channel" --number 1 --status in_review'
    );
    const status = args.values['--status'];
    if (!status) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --status todo|in_progress|in_review|done|closed.'
        );
    }
    const response = await deps.client.request(
        '/api/agent/tasks/update',
        taskSingleResponseSchema,
        withTaskSignal(deps, {
            body: { number: singleNumber(args), status, target },
            method: 'POST',
        })
    );
    const task = response.task;
    deps.write(
        `Task #${task.number} is now [${task.status}]${task.assignee ? ` (assignee ${assigneeLabel(task.assignee)})` : ''}.\n`
    );
    return 0;
}

function requireTarget(args: ParsedArgs, nextAction: string): string {
    const target = args.values['--target'];
    if (!target) {
        throw new AgentCliError('INVALID_ARG', 'Provide --target with a channel or DM target.', {
            nextAction,
        });
    }
    return target;
}

function singleNumber(args: ParsedArgs): number {
    const numbers = args.valueLists?.['--number'] ?? [];
    if (numbers.length !== 1) {
        throw new AgentCliError('INVALID_ARG', 'Provide exactly one --number.');
    }
    return parseTaskNumber(numbers[0] ?? '');
}

function parseTaskNumber(value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new AgentCliError('INVALID_ARG', `Invalid task number "${value}".`);
    }
    return parsed;
}

function withTaskSignal(deps: TaskDeps, input: AgentApiRequest): AgentApiRequest {
    return deps.signal ? { ...input, signal: deps.signal } : input;
}

export function defaultTaskDeps(): TaskDeps {
    return {
        client: createAgentApiClient(),
        mintNonce: () => `task-${randomUUID()}`,
        readStdin: readAgentStdin,
        stdinIsTty: () => process.stdin.isTTY === true,
        write: (text) => process.stdout.write(text),
    };
}
