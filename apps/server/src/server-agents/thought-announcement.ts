import type { AgentThoughtEvent } from '@haus/api';
import { announceAgentThought } from '../agent-delivery/thought-events.ts';
import type { ThoughtLine } from './thought-cadence.ts';
import type { PhrasedThought } from './thought-novelty.ts';
import type { ThoughtPreviousLines } from './thought-previous-lines.ts';

/**
 * Phrases one admitted frame for every Chat its run engages, once per distinct
 * set of lines already shown there (usually one), and hands the cadence a
 * single line to pace: new when any Chat hears a new workstream or finding.
 * Announcing tells each Chat its own line and remembers it there.
 */
export async function phraseForChats(input: {
    events: readonly Omit<AgentThoughtEvent, 'text'>[];
    phrase: (previous: readonly string[]) => Promise<PhrasedThought | null>;
    previousLines: ThoughtPreviousLines;
    scope: { computerId: string; requestId: string | null };
}): Promise<ThoughtLine | null> {
    const groups = groupByPrevious(input.events, (event) =>
        input.previousLines.read({ ...event, ...input.scope })
    );
    const phrased = await Promise.all(
        groups.map(async (group) => ({ group, line: await input.phrase(group.previous) }))
    );
    const shown = phrased.flatMap(({ group, line }) => (line ? [{ group, line }] : []));
    if (shown.length === 0) {
        return null;
    }
    return {
        announce: () => {
            for (const { group, line } of shown) {
                for (const event of group.events) {
                    announceAgentThought({ ...event, text: line.text });
                    input.previousLines.remember({ ...event, ...input.scope }, line.text);
                }
            }
        },
        stream: shown.some(({ line }) => line.stream === 'new') ? 'new' : 'still',
    };
}

/** Engaged Chats grouped by the lines the run last showed there, so each group is phrased once. */
function groupByPrevious<Event>(
    events: readonly Event[],
    previousOf: (event: Event) => readonly string[]
): { events: Event[]; previous: readonly string[] }[] {
    const groups = new Map<string, { events: Event[]; previous: readonly string[] }>();
    for (const event of events) {
        const previous = previousOf(event);
        const key = JSON.stringify(previous);
        const group = groups.get(key) ?? { events: [], previous };
        group.events.push(event);
        groups.set(key, group);
    }
    return [...groups.values()];
}
