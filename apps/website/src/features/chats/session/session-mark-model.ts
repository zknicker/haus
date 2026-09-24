import type { AgentSessionRotation } from '@haus/api';
import { formatRelativeTime } from '../../../lib/format.ts';

/**
 * When an Agent started over, derived from the transcript alone.
 *
 * A session reset writes nothing to the transcript — every row a human can read
 * has a human or an Agent author. What survives is a stamp: each Agent message
 * carries the generation of the session that wrote it. So the mark is a
 * difference, not a record, and this module is the one place that difference is
 * computed.
 */

/** The three fields the rule reads. Human messages carry nulls for both. */
export interface SessionMarkMessage {
    agentId: string | null;
    id: string;
    sessionGeneration: number | null;
}

export interface SessionMark {
    agentId: string;
    generation: number;
}

/**
 * Marks each Agent message whose session differs from that Agent's previous
 * message in the same transcript.
 *
 * Per Agent, so a channel where two Agents interleave marks each one's own
 * restarts; human messages in between are simply not that Agent's previous
 * message. The first message an Agent has in the loaded page is never marked:
 * a page boundary is not a reset, and nothing here can tell the two apart.
 */
export function deriveSessionMarks(
    messages: readonly SessionMarkMessage[]
): ReadonlyMap<string, SessionMark> {
    const marks = new Map<string, SessionMark>();
    const lastGenerationByAgent = new Map<string, number>();

    for (const message of messages) {
        const agentId = message.agentId;
        const generation = message.sessionGeneration;

        if (agentId === null || generation === null) {
            continue;
        }

        const previous = lastGenerationByAgent.get(agentId);
        lastGenerationByAgent.set(agentId, generation);

        if (previous !== undefined && previous !== generation) {
            marks.set(message.id, { agentId, generation });
        }
    }

    return marks;
}

/**
 * What a reader is told happened. The wire reasons are the Server's own
 * vocabulary for how a session ended; these are the same four facts said the
 * way someone who did not cause them would describe them.
 */
export function sessionRotationReasonLabel(reason: AgentSessionRotation['reason']): string {
    switch (reason) {
        case 'configuration':
            return 'Settings changed';
        case 'full':
            return 'Reset';
        case 'recovery':
            return 'Recovered';
        default:
            return 'Session rotated';
    }
}

/**
 * The hover card's fact line, after the reason the header already states:
 * when it happened, and how much running context it cost. An unknown previous
 * duration is left out rather than stated as zero.
 */
export function sessionRotationHoverFacts(
    rotation: AgentSessionRotation,
    now = Date.now()
): string[] {
    const facts = [formatRelativeTime(rotation.rotatedAt, now)];
    if (rotation.previousDurationMs !== null) {
        facts.push(`Previous session ran ${formatSessionDuration(rotation.previousDurationMs)}`);
    }
    return facts;
}

/**
 * How long the session before this one lasted. Coarse on purpose: the question
 * the hover card answers is "had it been running a while?", and a session that
 * ran for three days does not become clearer for reporting its minutes.
 */
export function formatSessionDuration(durationMs: number): string {
    const minutes = Math.floor(durationMs / 60_000);

    if (minutes < 1) {
        return 'under a minute';
    }
    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        const remainingMinutes = minutes % 60;
        return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
    }

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}
