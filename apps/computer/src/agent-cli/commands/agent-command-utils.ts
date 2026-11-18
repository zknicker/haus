import { formatTaskTarget, TASK_TARGET_PATTERN } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

export function requiredValue(args: ParsedArgs, flag: string): string {
    const value = args.values[flag]?.trim();
    if (!value) {
        throw new AgentCliError('INVALID_ARG', `${flag} is required.`);
    }
    return value;
}

export function optionalInteger(
    args: ParsedArgs,
    flag: string,
    options: { minimum: number }
): number | undefined {
    const value = args.values[flag];
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number(value);
    if (!(Number.isSafeInteger(parsed) && parsed >= options.minimum)) {
        throw new AgentCliError(
            'INVALID_ARG',
            `${flag} must be an integer greater than or equal to ${options.minimum}.`
        );
    }
    return parsed;
}

export function assertAgentTarget(target: string): void {
    refuseRemovedThreadTarget(target);
    const channel = /^#[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u;
    const dm = /^dm:@[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u;
    if (!(channel.test(target) || dm.test(target) || TASK_TARGET_PATTERN.test(target))) {
        throw new AgentCliError('INVALID_TARGET', `Invalid target "${target}".`, {
            nextAction: 'Use #channel, dm:@peer, or task:KEY-n.',
        });
    }
}

export function refuseRemovedThreadTarget(target: string): void {
    const match = /^(#[^:]+|dm:@[^:]+):([^:]+)$/u.exec(target.trim());
    if (!match) {
        return;
    }
    const [, parent, shortId] = match;
    throw new AgentCliError(
        'THREAD_TARGET_REMOVED',
        `Threads are gone: "${target}" names a thread on message ${shortId}, and Haus has no threads.`,
        {
            nextAction: `Reply inline instead: haus message send --target "${parent}" --reply-to ${shortId}. For work that outlasts a reply, start a Task from a channel message: haus task start --target "#channel" --from <shortid> --title <text>.`,
        }
    );
}

export function taskKeyArgument(value: string | undefined, flag: string): string {
    const raw = value?.trim() ?? '';
    const key = raw.startsWith('task:') ? raw.slice('task:'.length) : raw;
    if (!TASK_TARGET_PATTERN.test(formatTaskTarget(key))) {
        throw new AgentCliError('INVALID_ARG', `${flag} needs a Task key like SEC-12.`, {
            nextAction: 'Use the key haus task start or haus task list printed.',
        });
    }
    return key;
}

export function valuesFor(args: ParsedArgs, flag: string): string[] {
    return args.valueLists?.[flag] ?? (args.values[flag] ? [args.values[flag]] : []);
}
