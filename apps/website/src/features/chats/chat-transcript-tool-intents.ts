import type { ActivityItem } from './chat-transcript-activity-utils.ts';
import { activeVerb, completedVerb, intentCopy } from './chat-transcript-tool-intent-copy.ts';
import { getToolIntent } from './chat-transcript-tool-intent-resolver.ts';
import type { ToolIntent, ToolIntentKind } from './chat-transcript-tool-intent-types.ts';

export { mappedToolIntentNames } from './chat-transcript-tool-intent-catalog.ts';
export { getToolIntent } from './chat-transcript-tool-intent-resolver.ts';
export type { ToolIntent, ToolIntentKind } from './chat-transcript-tool-intent-types.ts';

export function getActiveWorkLabel(items: ActivityItem[]) {
    const intent = findLatestActiveIntent(items);

    if (!intent) {
        return null;
    }

    return formatIntent(intent, 'active', { preferSubject: true });
}

export function formatActiveWorkGroupHeader(items: ActivityItem[]) {
    const recoveryLabel = formatFailureWorkGroupHeader(items, 'active');

    if (recoveryLabel) {
        return recoveryLabel;
    }

    const activeIntent = findLatestActiveIntent(items);
    const summary = formatWorkGroupSummary(items);
    const intentCount = getMeaningfulIntents(items).length;

    if (activeIntent && intentCount <= 1) {
        return formatIntent(activeIntent, 'active', { preferSubject: true });
    }

    if (summary) {
        return summary;
    }

    if (activeIntent) {
        return formatIntent(activeIntent, 'active', { preferSubject: true });
    }

    return getToolIntents(items).some((intent) => intent.kind === 'thinking')
        ? 'Thinking'
        : 'Working';
}

export function formatWorkGroupHeader(items: ActivityItem[]) {
    const failureLabel = formatFailureWorkGroupHeader(items, 'completed');

    if (failureLabel) {
        return failureLabel;
    }

    const summary = formatWorkGroupSummary(items);

    if (summary) {
        return summary;
    }

    return getToolIntents(items).some((intent) => intent.kind === 'thinking')
        ? 'Thinking'
        : 'Worked';
}

export function formatWorkGroupSummary(items: ActivityItem[]) {
    const meaningfulIntents = getMeaningfulIntents(items);

    if (meaningfulIntents.length === 0) {
        return null;
    }

    if (meaningfulIntents.length === 1) {
        return formatIntent(meaningfulIntents[0], 'completed', { preferSubject: true });
    }

    const groups = groupIntents(meaningfulIntents);
    const parts = groups.slice(0, 2).map((group) => formatIntentGroup(group));

    return joinHeaderParts(parts);
}

function findLatestActiveIntent(items: ActivityItem[]) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];

        if (!item) {
            continue;
        }

        if (
            (item.row.kind === 'tool' || item.row.kind === 'subagent') &&
            item.row.completedAt === null
        ) {
            return getToolIntent(item);
        }
    }

    return null;
}

function formatFailureWorkGroupHeader(items: ActivityItem[], mode: 'active' | 'completed') {
    const failedIndex = findLastFailedToolIndex(items);

    if (failedIndex === -1) {
        return null;
    }

    const failedItem = items[failedIndex];

    if (!failedItem) {
        return null;
    }

    const failure = formatFailedToolIntent(failedItem);
    const recovered = hasCompletedWorkAfter(items, failedIndex);

    if (mode === 'active') {
        return recovered ? `Recovering after ${failure}` : `Recovering from ${failure}`;
    }

    return recovered ? `Recovered after ${failure}` : capitalize(failure);
}

function findLastFailedToolIndex(items: ActivityItem[]) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];

        if (item?.row.kind === 'tool' && hasFailedToolStatus(item.row.toolCall.status)) {
            return index;
        }
    }

    return -1;
}

function hasCompletedWorkAfter(items: ActivityItem[], index: number) {
    return items.slice(index + 1).some((item) => {
        if (item.row.kind === 'tool') {
            return Boolean(item.row.completedAt && !hasFailedToolStatus(item.row.toolCall.status));
        }

        if (item.row.kind === 'subagent') {
            return Boolean(item.row.completedAt);
        }

        return false;
    });
}

function formatFailedToolIntent(item: ActivityItem) {
    const intent = getToolIntent(item);
    const target =
        intent?.subject && intent.subjectVisibility === 'header' ? `: ${intent.subject}` : '';
    const noun = intent ? failedIntentNoun(intent.kind) : 'tool';

    return `failed ${noun}${target}`;
}

function failedIntentNoun(kind: ToolIntentKind) {
    switch (kind) {
        case 'automation':
            return 'automation';
        case 'browser':
            return 'browser action';
        case 'calendar':
            return 'calendar check';
        case 'code':
            return 'code run';
        case 'code-search':
            return 'code search';
        case 'command':
            return 'command';
        case 'computer':
            return 'computer action';
        case 'clarification':
            return 'question';
        case 'document':
            return 'document check';
        case 'file-edit':
            return 'file edit';
        case 'file-list':
            return 'file listing';
        case 'file-read':
            return 'file read';
        case 'home':
            return 'Home Assistant action';
        case 'image':
            return 'media action';
        case 'memory':
            return 'memory check';
        case 'message':
            return 'message';
        case 'skill':
            return 'skill check';
        case 'task':
            return 'task update';
        case 'thinking':
            return 'thinking step';
        case 'tool':
            return 'tool';
        case 'voice':
            return 'audio generation';
        case 'web':
            return 'web search';
        case 'wiki':
            return 'wiki check';
        case 'subagent':
            return 'agent task';
    }
}

function getToolIntents(items: ActivityItem[]) {
    return items.map(getToolIntent).filter((intent): intent is ToolIntent => Boolean(intent));
}

function getMeaningfulIntents(items: ActivityItem[]) {
    return getToolIntents(items).filter((intent) => intent.kind !== 'thinking');
}

function groupIntents(intents: ToolIntent[]) {
    const groups = new Map<ToolIntentKind, { count: number; intent: ToolIntent }>();

    for (const intent of intents) {
        const current = groups.get(intent.kind);

        if (!current) {
            groups.set(intent.kind, { count: 1, intent });
            continue;
        }

        current.count += 1;
    }

    return [...groups.values()].sort((left, right) => {
        const countDelta = right.count - left.count;

        if (countDelta !== 0) {
            return countDelta;
        }

        return intentCopy[right.intent.kind].priority - intentCopy[left.intent.kind].priority;
    });
}

function formatIntent(
    intent: ToolIntent,
    mode: 'active' | 'completed',
    options: { preferSubject: boolean }
) {
    const copy = intentCopy[intent.kind];

    if (
        options.preferSubject &&
        intent.subject &&
        intent.subjectVisibility === 'header' &&
        intent.kind !== 'clarification'
    ) {
        return `${mode === 'active' ? activeVerb(intent.kind) : completedVerb(intent.kind)} ${
            intent.subject
        }`;
    }

    return mode === 'active' ? copy.active : copy.completed;
}

function formatIntentGroup(group: { count: number; intent: ToolIntent }) {
    const copy = intentCopy[group.intent.kind];

    if (group.count === 1) {
        return formatIntent(group.intent, 'completed', { preferSubject: false });
    }

    return copy.plural ? copy.plural.replace('{count}', String(group.count)) : copy.completed;
}

function joinHeaderParts(parts: string[]) {
    const normalizedParts = parts.filter(Boolean);

    if (normalizedParts.length <= 1) {
        return normalizedParts[0] ?? null;
    }

    const [first, second] = normalizedParts;
    return `${first}, ${second.charAt(0).toLowerCase()}${second.slice(1)}`;
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

function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
