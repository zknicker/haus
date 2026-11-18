import { BrainIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { TranscriptItem, TranscriptRow } from './chat-transcript-model.ts';
import { resolveToolStepIcon, type ToolStepIcon } from './tool-steps/tool-step-icons.ts';

type ActivityRow = Exclude<TranscriptRow, Extract<TranscriptRow, { kind: 'message' | 'widget' }>>;

export type ActivityItem = Extract<TranscriptItem, { kind: 'row' }> & {
    row: ActivityRow;
};

export {
    formatActiveWorkGroupHeader,
    formatWorkGroupHeader,
    formatWorkGroupSummary,
    getActiveWorkLabel,
    getToolIntent,
    mappedToolIntentNames,
} from './chat-transcript-tool-intents.ts';

export function isActivityItem(item: TranscriptItem): item is ActivityItem {
    if (item.kind === 'activeReply' || item.kind === 'activeStatus') {
        return false;
    }

    if (item.kind === 'row' && item.row.kind === 'system' && item.row.systemKind === 'turnStatus') {
        return false;
    }

    return (
        item.kind !== 'row' ||
        (item.row.kind !== 'message' && item.row.kind !== 'widget' && !isNarrationToolRow(item.row))
    );
}

export function isAssistantNarrationItem(item: TranscriptItem): item is Extract<
    TranscriptItem,
    { kind: 'row' }
> & {
    row: Extract<TranscriptRow, { kind: 'tool' }>;
} {
    return item.kind === 'row' && isNarrationToolRow(item.row);
}

export function isActiveActivityItem(item: ActivityItem) {
    if (item.row.kind === 'tool') {
        return !(item.row.completedAt || hasFailedToolStatus(item.row.toolCall.status));
    }

    if (item.row.kind === 'worker') {
        return !item.row.completedAt;
    }

    return false;
}

export function getActivityStart(items: ActivityItem[]) {
    return items.map(getActivityStartTimestamp).find((timestamp) => timestamp !== null) ?? null;
}

export function getActivityEnd(items: ActivityItem[]) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        const timestamp = getActivityEndTimestamp(items[index]);

        if (timestamp) {
            return timestamp;
        }
    }

    return null;
}

function getActivityStartTimestamp(item: ActivityItem | undefined): string | null {
    if (!item) {
        return null;
    }

    if (item.row.kind === 'tool' || item.row.kind === 'worker') {
        return item.row.startedAt ?? item.row.completedAt;
    }

    if (item.row.kind === 'system') {
        return item.row.timestamp;
    }

    return null;
}

function getActivityEndTimestamp(item: ActivityItem | undefined): string | null {
    if (!item) {
        return null;
    }

    if (item.row.kind === 'tool' || item.row.kind === 'worker') {
        return item.row.completedAt;
    }

    if (item.row.kind === 'system') {
        return item.row.timestamp;
    }

    return null;
}

export function formatActivityHeader({
    end,
    isActive,
    now,
    start,
}: {
    end: string | null;
    isActive: boolean;
    now: number;
    start: string | null;
}) {
    const duration = formatElapsed(start, isActive ? now : end);

    if (!duration) {
        return isActive ? 'Working' : 'Worked';
    }

    return `${isActive ? 'Working' : 'Worked'} for ${duration}`;
}

export function formatActiveActivitySeconds({ now, start }: { now: number; start: string | null }) {
    if (!start) {
        return null;
    }

    const startMs = Date.parse(start);

    if (Number.isNaN(startMs)) {
        return null;
    }

    return `${Math.floor(Math.max(0, now - startMs) / 1000)}s`;
}

function formatElapsed(start: string | null, end: number | string | null) {
    if (!(start && end)) {
        return null;
    }

    const startMs = Date.parse(start);
    const endMs = typeof end === 'number' ? end : Date.parse(end);

    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return null;
    }

    const elapsedMs = Math.max(0, endMs - startMs);

    const totalSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];

    if (hours > 0) {
        parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }

    if (minutes > 0) {
        parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    }

    if (seconds > 0 || parts.length === 0) {
        parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
    }

    return parts.join(' ');
}

export function getActivityItemKey(item: ActivityItem) {
    return item.row.id;
}

export function getAssistantNarrationText(item: TranscriptItem) {
    if (!isAssistantNarrationItem(item)) {
        return null;
    }

    const label = item.row.toolCall.label?.trim() ?? '';
    const parts = item.row.toolCall.summaryParts.map((part) => part.trim()).filter(Boolean);
    const [firstPart, ...remainingParts] = parts;
    const bodyParts =
        firstPart && isNarrationTitle(firstPart, label) && remainingParts.length > 0
            ? remainingParts
            : parts;
    const text = bodyParts.join('\n').trim() || label;

    return text.length > 0 ? text : null;
}

/**
 * Icon for a collapsed work group header: the running tool's icon while
 * work executes, the shared icon when every tool resolves to one kind, and
 * the generic tools icon for mixed groups.
 */
export function getWorkGroupIcon(items: ActivityItem[]): ToolStepIcon | null {
    const toolNames = items.flatMap((item) =>
        item.row.kind === 'tool' && !isNarrationToolRow(item.row) ? [item.row.toolCall.name] : []
    );

    if (toolNames.length === 0) {
        // Thinking-only groups carry the same header shape as tool groups:
        // icon plus label.
        return items.some(isThinkingActivityItem) ? BrainIcon : null;
    }

    for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];

        if (item && isActiveActivityItem(item) && item.row.kind === 'tool') {
            return resolveToolStepIcon(item.row.toolCall.name);
        }
    }

    const icons = new Set(toolNames.map((name) => resolveToolStepIcon(name)));
    const [firstIcon] = icons;

    return icons.size === 1 && firstIcon ? firstIcon : resolveToolStepIcon('tool');
}

function isNarrationToolRow(row: TranscriptRow) {
    return row.kind === 'tool' && row.toolCall.name.trim().toLowerCase() === 'message';
}

function isThinkingActivityItem(item: ActivityItem) {
    return item.row.kind === 'system' && item.row.systemKind === 'thinking';
}

function isNarrationTitle(value: string, label: string) {
    const normalizedValue = value.trim().toLowerCase();
    const normalizedLabel = label.trim().toLowerCase();

    return (
        normalizedValue === 'assistant reply' ||
        normalizedValue === 'preamble' ||
        (normalizedLabel.length > 0 && normalizedValue === normalizedLabel)
    );
}

function hasFailedToolStatus(status: string | null) {
    if (!status) {
        return false;
    }

    const normalized = status.toLowerCase();
    return (
        normalized.includes('error') ||
        normalized.includes('forbidden') ||
        normalized.includes('failed') ||
        normalized.includes('timeout') ||
        normalized.includes('timed out')
    );
}
