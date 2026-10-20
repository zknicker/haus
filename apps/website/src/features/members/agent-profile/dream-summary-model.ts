import { formatShortTime } from '../../../lib/format.ts';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { formatDayLabel, localDayKey } from './agent-turn-row-model.ts';

/**
 * What the Agent wrote about the night, as the dream reads it. The summary is
 * the Agent's own words ("What I learned"); a dream row and the hover card
 * lead with its first line, and the sheet renders the whole thing.
 */

/** The summary's first non-blank line, flattened to plain text; empty when it has none. */
export function dreamSummaryHeadline(summary: string | null): string {
    const first = summary?.split('\n').find((line) => messagePreviewLine(line) !== '');
    return first ? messagePreviewLine(first) : '';
}

const listItemPattern = /^\s*(?:[-*+]|\d+[.)])\s/u;

/**
 * The summary as the Markdown renderer should read it: a bulleted summary stays
 * a list, and plain lines keep their line breaks (a single newline would
 * otherwise fold into one paragraph) by ending each with a hard break.
 */
export function dreamSummaryMarkdown(summary: string): string {
    const lines = summary.trim().split('\n');
    return lines
        .map((line, index) => {
            const next = lines[index + 1];
            const breaks =
                next !== undefined &&
                line.trim() !== '' &&
                next.trim() !== '' &&
                !listItemPattern.test(line) &&
                !listItemPattern.test(next);
            return breaks ? `${line.trimEnd()}  ` : line;
        })
        .join('\n');
}

/** `Tomorrow 9:00 am`, `Today 9:00 am`, or `Oct 21 9:00 am` for a follow-up's reminder. */
export function formatFollowUpWhen(fireAt: string, now: number): string {
    const date = new Date(fireAt);
    const today = new Date(now);
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const day =
        localDayKey(date) === localDayKey(tomorrow) ? 'Tomorrow' : formatDayLabel(date, now);
    return `${day} ${formatShortTime(fireAt)}`;
}
