import {
    formatTaskReferenceTarget,
    parseTaskKey,
    parseTaskReferenceTarget,
    type TaskLink,
} from '@haus/api';
import { normalizeMentions } from './mention-text.ts';
import type { Mention } from './mention-types.ts';

interface TextRange {
    end: number;
    start: number;
}

/**
 * A message's Task references as mentions (ADR 0051). The Server resolved them
 * when the message was written (`message.taskLinks`), so this never decides
 * what is a Task, only where the resolved text sits: an explicit `task://` link
 * is already a mention and gains its key, and a bare key becomes one wherever
 * its exact text stands on its own. The rule mirrors the Server's scan
 * (`tasks/task-reference-scan.ts`): word-bounded, and never inside code, a
 * Markdown link, or a plain URL. A segment of a message that does not carry the
 * text simply gains nothing.
 */
export function applyTaskLinks(
    mentions: readonly Mention[],
    content: string,
    taskLinks: readonly TaskLink[] | undefined
): readonly Mention[] {
    if (!taskLinks || taskLinks.length === 0) {
        return mentions;
    }
    const keyByTaskId = new Map(taskLinks.map((link) => [link.taskId, link.key]));
    const linked = mentions.map((mention) => {
        const taskId = mention.kind === 'task' ? parseTaskReferenceTarget(mention.id) : null;
        const taskKey = taskId ? keyByTaskId.get(taskId) : undefined;
        return taskKey ? { ...mention, metadata: { ...mention.metadata, taskKey } } : mention;
    });
    return normalizeMentions(content, [...linked, ...bareKeyMentions(content, taskLinks)]);
}

/** A Task chip's key, when the mention carries one. */
export function readTaskKey(metadata: Record<string, unknown> | undefined) {
    return typeof metadata?.taskKey === 'string' ? metadata.taskKey : undefined;
}

function bareKeyMentions(content: string, taskLinks: readonly TaskLink[]): Mention[] {
    const shielded = [...readCodeRanges(content), ...readMarkdownLinkRanges(content)];
    const byText = new Map(taskLinks.map((link) => [link.text, link]));
    return [...byText.values()]
        .filter((link) => parseTaskKey(link.text))
        .flatMap((link) =>
            occurrences(content, link.text)
                .filter((start) => standsAlone(content, start, link.text.length, shielded))
                .map((start) => taskMention(link, start))
        );
}

function taskMention(link: TaskLink, start: number): Mention {
    return {
        end: start + link.text.length,
        id: formatTaskReferenceTarget(link.taskId),
        kind: 'task',
        label: link.key,
        metadata: { taskKey: link.key },
        projection: 'task-reference',
        start,
        text: link.text,
    };
}

function occurrences(content: string, text: string): number[] {
    const starts: number[] = [];
    for (
        let start = content.indexOf(text);
        start !== -1;
        start = content.indexOf(text, start + text.length)
    ) {
        starts.push(start);
    }
    return starts;
}

function standsAlone(content: string, start: number, length: number, shielded: TextRange[]) {
    const end = start + length;
    return (
        isKeyBoundary(content[start - 1]) &&
        isKeyBoundary(content[end]) &&
        !shielded.some((range) => start >= range.start && end <= range.end) &&
        !/(?:https?:\/\/|www\.)[^\s]*$/iu.test(content.slice(0, start))
    );
}

function isKeyBoundary(character: string | undefined) {
    return !(character && /[-A-Za-z0-9_/]/u.test(character));
}

function readMarkdownLinkRanges(content: string): TextRange[] {
    return [...content.matchAll(/!?\[[^\]\n]*\]\([^)\n]*\)/gu)].map((match) => ({
        end: match.index + match[0].length,
        start: match.index,
    }));
}

/** Fenced blocks and inline code spans: prose that never resolves a reference. */
function readCodeRanges(content: string): TextRange[] {
    const fences = readFenceRanges(content);
    return [...fences, ...readInlineCodeRanges(content, fences)];
}

function readFenceRanges(content: string): TextRange[] {
    const ranges: TextRange[] = [];
    let open: { marker: string; start: number } | null = null;
    let lineStart = 0;
    for (const line of content.split('\n')) {
        const marker = /^[ \t]{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
        const lineEnd = lineStart + line.length + 1;
        if (marker && !open) {
            open = { marker, start: lineStart };
        } else if (marker && open && closesFence(marker, open.marker)) {
            ranges.push({ end: Math.min(lineEnd, content.length), start: open.start });
            open = null;
        }
        lineStart = lineEnd;
    }
    return open ? [...ranges, { end: content.length, start: open.start }] : ranges;
}

function closesFence(marker: string, opening: string) {
    return marker[0] === opening[0] && marker.length >= opening.length;
}

function readInlineCodeRanges(content: string, fences: readonly TextRange[]): TextRange[] {
    const ranges: TextRange[] = [];
    for (const match of content.matchAll(/`+/gu)) {
        const start = match.index;
        const inFence = fences.some((range) => start >= range.start && start < range.end);
        const covered = ranges.some((range) => start < range.end);
        if (inFence || covered) {
            continue;
        }
        const end = inlineCodeEnd(content, start + match[0].length, match[0]);
        if (end !== null) {
            ranges.push({ end, start });
        }
    }
    return ranges;
}

/** Where a span's closing ticks end; a span never crosses a line. */
function inlineCodeEnd(content: string, from: number, ticks: string) {
    const closing = content.indexOf(ticks, from);
    const lineEnd = content.indexOf('\n', from);
    if (closing === -1 || (lineEnd !== -1 && closing > lineEnd)) {
        return null;
    }
    return closing + ticks.length;
}
