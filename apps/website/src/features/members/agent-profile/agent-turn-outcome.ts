import type { AgentTurnOperationCategory } from '@haus/api';
import { formatAgentActivityEvent } from './agent-activity-model.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';

/**
 * What a turn did, in words, most telling first: `Ran 2 sub-agents · edited 3
 * files · read 4 · sent 1 message`. A noun the previous action already named
 * is not repeated. Failed or interrupted calls follow their count.
 */
export function formatTurnOutcome(turn: AgentActivityTurn): string {
    const actions = [...turn.operations]
        .sort(
            (left, right) =>
                outcomeOrder.indexOf(left.category) - outcomeOrder.indexOf(right.category)
        )
        .map((operation) => {
            const total = operation.completed + operation.failed + operation.interrupted;
            const exceptions = [
                operation.failed > 0 ? `${operation.failed} failed` : null,
                operation.interrupted > 0 ? `${operation.interrupted} interrupted` : null,
            ].filter(Boolean);
            return {
                ...outcomeAction(operation.category, total),
                suffix: exceptions.length > 0 ? ` (${exceptions.join(', ')})` : '',
            };
        });
    if (turn.messageCount > 0) {
        actions.push({ ...outcomeAction('sending_message', turn.messageCount), suffix: '' });
    }
    const parts = [
        // The row's status mark already says "Failed"; only a known reason adds anything.
        ...(turn.kind === 'settled' && turn.status === 'failed' && turn.failureKind
            ? [failureReasons[turn.failureKind]].filter((reason) => reason !== undefined)
            : []),
        ...actions.map((action, index) => {
            // `Searched the web` needs no count of one, and its `times` never carries over.
            if (action.isRepeat) {
                const count = action.count === 1 ? '' : ` ${action.count} ${action.noun}`;
                return `${action.verb}${count}${action.suffix}`;
            }
            const repeated = index > 0 && actions[index - 1]?.noun === action.noun;
            return `${action.verb} ${action.count}${repeated ? '' : ` ${action.noun}`}${action.suffix}`;
        }),
    ];
    if (parts.length > 0) {
        return parts.map((part, index) => (index === 0 ? part : lowerFirst(part))).join(' · ');
    }
    if (turn.kind === 'active') {
        // Nothing has settled yet: say what the Agent is doing right now.
        const latest = turn.events.at(-1);
        return latest ? formatAgentActivityEvent(latest) : 'Starting…';
    }
    // `outputProduced` is false here (no messages), so a completed turn is the
    // Agent's positive choice to stay quiet, not a lost run.
    if (turn.status === 'completed') {
        if (turn.trigger?.kind === 'heartbeat') {
            return turn.trigger.report ? 'Reported' : 'Checked in';
        }
        return 'Stayed quiet';
    }
    return 'Ended before any action';
}

const failureReasons: Readonly<Record<string, string>> = {
    authentication: 'Needs sign-in',
    configuration: 'Configuration error',
    input: 'Invalid input',
    'rate-limit': 'Rate limited',
    'session-resume': 'Session could not resume',
    timeout: 'Timed out',
    transport: 'Connection lost',
};

const outcomeOrder: readonly AgentTurnOperationCategory[] = [
    'delegating',
    'generating_image',
    'generating_video',
    'editing_files',
    'running_command',
    'searching_web',
    'browsing',
    'reading_files',
    'using_tool',
    'updating_instructions',
    'checking_messages',
];

/** Verb, then the singular and plural noun its count takes. */
const outcomeWords: Record<
    AgentTurnOperationCategory | 'sending_message',
    readonly [string, string, string]
> = {
    browsing: ['Took', 'browser action', 'browser actions'],
    checking_messages: ['Checked messages', 'time', 'times'],
    delegating: ['Ran', 'sub-agent', 'sub-agents'],
    editing_files: ['Edited', 'file', 'files'],
    generating_image: ['Generated', 'image', 'images'],
    generating_video: ['Generated', 'video', 'videos'],
    reading_files: ['Read', 'file', 'files'],
    running_command: ['Ran', 'command', 'commands'],
    searching_web: ['Searched the web', 'time', 'times'],
    sending_message: ['Sent', 'message', 'messages'],
    updating_instructions: ['Updated instructions', 'time', 'times'],
    using_tool: ['Used', 'tool', 'tools'],
};

function outcomeAction(category: keyof typeof outcomeWords, count: number) {
    const [verb, one, many] = outcomeWords[category];
    return { count, isRepeat: one === 'time', noun: count === 1 ? one : many, verb };
}

function lowerFirst(value: string): string {
    return value.charAt(0).toLowerCase() + value.slice(1);
}
