import { isTaskShortId, TASK_TARGET_PATTERN } from '@haus/api';
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
    const captain = /^captain:@[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u;
    if (!(channel.test(target) || captain.test(target) || TASK_TARGET_PATTERN.test(target))) {
        throw new AgentCliError('INVALID_TARGET', `Invalid target "${target}".`, {
            nextAction: 'Use #channel, captain:@handle, or task:<shortId>.',
        });
    }
}

export function refuseRemovedThreadTarget(target: string): void {
    const match = /^(#[^:]+|captain:@[^:]+):([^:]+)$/u.exec(target.trim());
    if (!match) {
        return;
    }
    const [, parent, shortId] = match;
    throw new AgentCliError(
        'THREAD_TARGET_REMOVED',
        `Threads are gone: "${target}" names a thread on message ${shortId}, and Haus has no threads.`,
        {
            nextAction: `Reply inline instead: haus message send --target "${parent}" --reply-to ${shortId}. Work that outlasts a reply goes to a Task: haus task start --target "${parent}" --from ${shortId} --title <text> < brief.`,
        }
    );
}

/** A Task's short id, bare or as its `task:` target. */
export function taskShortIdArgument(value: string | undefined, flag: string): string {
    const ref = stripTaskPrefix(value);
    if (!isTaskShortId(ref)) {
        throw new AgentCliError('INVALID_ARG', `${flag} needs a Task short id like k3mq7xta.`, {
            nextAction: 'Use the short id haus task start or haus task list printed.',
        });
    }
    return ref;
}

/** A Task's short id, or its full `tsk_` id. */
export function taskRefArgument(value: string | undefined, flag: string): string {
    const ref = stripTaskPrefix(value);
    return ref.startsWith('tsk_') ? ref : taskShortIdArgument(ref, flag);
}

function stripTaskPrefix(value: string | undefined) {
    const raw = value?.trim() ?? '';
    return raw.startsWith('task:') ? raw.slice('task:'.length) : raw;
}

export function valuesFor(args: ParsedArgs, flag: string): string[] {
    return args.valueLists?.[flag] ?? (args.values[flag] ? [args.values[flag]] : []);
}
