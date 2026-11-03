import { type AdventEntry, adventDoorCount } from '@haus/api';
import type {
    AdventCountedFact,
    AdventFactStat,
    AdventFactStats,
    AdventRecapCounts,
} from '../fact-stats.ts';
import { agentCopy } from './agent-copy.ts';
import type { FactCopy, FactCopyBook } from './fact-copy.ts';
import { compactTokens, count, hour } from './format.ts';
import { b, type Line, line, pickVariant } from './line.ts';
import { rhythmCopy } from './rhythm-copy.ts';
import { roomCopy } from './room-copy.ts';

export const factCopy: FactCopyBook = { ...rhythmCopy, ...roomCopy, ...agentCopy };

/** One door's entry: the fact's title and a stable variant of its line. */
export function composeFactEntry<F extends AdventCountedFact>(input: {
    day: number;
    fact: F;
    seed: string;
    stat: AdventFactStat<F>;
}): AdventEntry {
    const copy = factCopy[input.fact] as FactCopy<F>;
    const choices = input.stat === null ? copy.empty : copy.lines(input.stat);
    return {
        day: input.day,
        fact: input.fact,
        kind: 'fact',
        line: [...pickVariant(choices, input.seed)],
        title: copy.title,
    };
}

/** What the recap summarizes; each part is null when that door was empty. */
export interface AdventRecapStats {
    agents: AdventFactStats['agents-at-table'] | null;
    busiestHour: AdventFactStats['busiest-hour'] | null;
    counts: AdventRecapCounts;
    loudest: AdventFactStats['loudest-channel'] | null;
    messages: AdventFactStats['messages-sent'] | null;
    tasks: AdventFactStats['tasks-closed'] | null;
    thanked: AdventFactStats['most-thanked-agent'] | null;
    tokens: AdventFactStats['tokens-used'] | null;
}

/**
 * The Dec 24 recap: up to eight tiles, each omitted when it has no data, and a
 * closing line naming the loudest room. A year with nothing counted still
 * shows its true zero rather than an empty tile set.
 */
export function composeRecapEntry(stats: AdventRecapStats, seed: string): AdventEntry {
    const tiles: { label: string; value: string }[] = [];
    const add = (label: string, value: string | null) => {
        if (value !== null) {
            tiles.push({ label, value });
        }
    };
    add('Messages', stats.messages ? count(stats.messages.count) : null);
    add('Chats', positive(stats.counts.chats));
    add('Threads', positive(stats.counts.threads));
    add('Agents', stats.agents ? count(stats.agents.count) : null);
    add('Tasks closed', stats.tasks ? count(stats.tasks.count) : null);
    add('Tokens', stats.tokens ? compactTokens(stats.tokens.tokens) : null);
    add('Busiest hour', stats.busiestHour ? hour(stats.busiestHour.hour) : null);
    add('Most thanked', stats.thanked?.name ?? null);
    return {
        closing: [...pickVariant(closingLines(stats.loudest?.name ?? null), seed)],
        day: adventDoorCount,
        fact: 'recap',
        kind: 'recap',
        stats: tiles.length > 0 ? tiles : [{ label: 'Messages', value: '0' }],
        title: 'Your year in Haus',
    };
}

function closingLines(loudest: string | null): readonly Line[] {
    if (!loudest) {
        return [
            line('A quiet year by the fire. Same time next year?'),
            line("Quiet year, warm hearth. We'll keep your chair."),
        ];
    }
    return [
        line('Most of it happened in ', b(loudest), '. Same time next year?'),
        line(b(loudest), ' was the heart of it. Save us a seat there next year.'),
    ];
}

function positive(value: number): string | null {
    return value > 0 ? count(value) : null;
}
