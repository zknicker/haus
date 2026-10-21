import type { AgentTurnTrigger, Chat } from '@haus/api';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { chatPlace } from '../../shell/tab-identity.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { formatTurnOutcome } from './agent-turn-outcome.ts';

export type TurnRunBadge = 'Dream' | 'Heartbeat';

/**
 * What marks a turn as a heartbeat or dream run in the Activity Log: its badge
 * and the one line saying what the run came to. `outcome` is what a run that
 * finished well reports; a run that did not says so with the turn's own failure
 * text, and a `paused` run (the Server stopped it for a message) says that.
 * `outcome` is null while the run works and for a report turn, which reads as
 * any other turn.
 */
export interface TurnRunMark {
    readonly badge: TurnRunBadge;
    readonly outcome: string | null;
    readonly paused: boolean;
}

/**
 * The one muted line under a heartbeat or dream row's title, or null when the
 * run has nothing to add: what it came to when it finished well, the turn's own
 * failure text when it did not, and that it paused when the Server stopped it.
 */
export function readRunOutcomeLine(run: TurnRunMark, turn: AgentActivityTurn): string | null {
    if (turn.kind === 'active') {
        return null;
    }
    if (run.paused) {
        return 'Paused for a new message';
    }
    return turn.status === 'completed' ? run.outcome : formatTurnOutcome(turn);
}

/** The mark for a dream, heartbeat, or heartbeat-report trigger; null for any other turn. */
export function resolveRunMark(
    trigger: AgentTurnTrigger,
    chats: ReadonlyMap<string, Pick<Chat, 'kind' | 'name'>>,
    live: boolean
): TurnRunMark | null {
    switch (trigger.kind) {
        case 'dream':
            return { badge: 'Dream', outcome: live ? null : dreamOutcome(trigger), paused: false };
        case 'heartbeat':
            return {
                badge: 'Heartbeat',
                outcome: live ? null : heartbeatOutcome(trigger, chats),
                paused: trigger.yielded,
            };
        case 'heartbeat_report':
            return { badge: 'Heartbeat', outcome: null, paused: false };
        default:
            return null;
    }
}

/** The learned line, else how much memory was tidied, else that nothing changed. */
function dreamOutcome(trigger: Extract<AgentTurnTrigger, { kind: 'dream' }>): string {
    const learned = trigger.learned ? messagePreviewLine(trigger.learned) : '';
    if (learned) {
        return learned;
    }
    return trigger.added + trigger.removed > 0
        ? `Tidied memory (+${trigger.added} −${trigger.removed})`
        : 'No memory changes';
}

/** The report's first sentence and what the main session did with it, or that it was quiet. */
function heartbeatOutcome(
    trigger: Extract<AgentTurnTrigger, { kind: 'heartbeat' }>,
    chats: ReadonlyMap<string, Pick<Chat, 'kind' | 'name'>>
): string {
    const { report } = trigger;
    if (!report) {
        return 'Nothing to report';
    }
    const sentence = firstSentence(report.text);
    const fate = reportFate(report.postedChatId, chats);
    return sentence ? `${sentence} · ${fate}` : fate;
}

function reportFate(
    postedChatId: string | null,
    chats: ReadonlyMap<string, Pick<Chat, 'kind' | 'name'>>
): string {
    if (!postedChatId) {
        return 'Read, not posted';
    }
    const chat = chats.get(postedChatId);
    return chat ? `Posted in ${chatPlace(chat)}` : 'Posted';
}

/** The first sentence of Markdown text, flattened to one plain line. */
function firstSentence(text: string): string {
    const flat = messagePreviewLine(text);
    return /^.+?[.!?](?=\s|$)/u.exec(flat)?.[0] ?? flat;
}
