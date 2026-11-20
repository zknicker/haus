import type { ActivityItem } from './chat-transcript-activity-utils.ts';
import {
    commandToolNames,
    exactToolKinds,
    exactToolSubjects,
    longHeaderSubjectLimit,
} from './chat-transcript-tool-intent-catalog.ts';
import type { ToolIntent, ToolIntentKind } from './chat-transcript-tool-intent-types.ts';
import { isEditTool } from './tool-steps/tool-step-icons.ts';

export function getToolIntent(item: ActivityItem): ToolIntent | null {
    if (item.row.kind === 'system') {
        return item.row.systemKind === 'thinking' ? { kind: 'thinking' } : null;
    }

    if (item.row.kind === 'subagent') {
        return {
            kind: 'subagent',
            ...(item.row.subagent.title
                ? { subject: item.row.subagent.title, subjectVisibility: 'header' }
                : {}),
        };
    }

    if (item.row.kind !== 'tool') {
        return { kind: 'tool' };
    }

    const name = item.row.toolCall.name.trim();
    const normalizedName = name.toLowerCase();
    const subject = resolveToolSubject(item, normalizedName);

    if (matchesAny(normalizedName, commandToolNames)) {
        return (
            inferCommandIntent(subject) ?? {
                kind: 'command',
                ...(subject
                    ? { subject, subjectVisibility: resolveSubjectVisibility(subject, 'command') }
                    : {}),
            }
        );
    }

    const exactKind = exactToolKinds[normalizedName as keyof typeof exactToolKinds];

    if (exactKind) {
        const exactSubject = exactToolSubjects[normalizedName as keyof typeof exactToolSubjects];
        return {
            kind: exactKind,
            ...(exactSubject
                ? { subject: exactSubject, subjectVisibility: 'header' as const }
                : subject
                  ? { subject, subjectVisibility: resolveSubjectVisibility(subject, exactKind) }
                  : {}),
        };
    }

    if (isEditTool(normalizedName) || isFileEditToolName(normalizedName)) {
        return {
            kind: 'file-edit',
            ...(subject ? { subject, subjectVisibility: resolveSubjectVisibility(subject) } : {}),
        };
    }

    if (isFileReadToolName(normalizedName)) {
        return {
            kind: 'file-read',
            ...(subject ? { subject, subjectVisibility: resolveSubjectVisibility(subject) } : {}),
        };
    }

    if (isCodeSearchToolName(normalizedName)) {
        return {
            kind: 'code-search',
            ...(subject ? { subject, subjectVisibility: resolveSubjectVisibility(subject) } : {}),
        };
    }

    if (normalizedName.includes('calendar')) {
        return { kind: 'calendar' };
    }

    if (normalizedName.includes('browser')) {
        return { kind: 'browser' };
    }

    if (normalizedName.includes('web') || normalizedName.startsWith('mcp__web')) {
        return { kind: 'web' };
    }

    if (normalizedName.includes('skill')) {
        return { kind: 'skill' };
    }

    if (normalizedName.includes('memory')) {
        return { kind: 'memory' };
    }

    if (normalizedName.includes('wiki')) {
        return { kind: 'wiki' };
    }

    if (subject) {
        return {
            kind: 'tool',
            subject,
            subjectVisibility: resolveSubjectVisibility(subject, 'tool'),
        };
    }

    return { kind: 'tool' };
}

function resolveToolSubject(item: ActivityItem, normalizedName: string) {
    if (item.row.kind !== 'tool') {
        return null;
    }

    const name = item.row.toolCall.name.trim();
    const target =
        item.row.toolCall.summaryParts.join(' ').trim() || item.row.toolCall.label?.trim() || '';

    if (!(target && target.toLowerCase() !== name.toLowerCase())) {
        return null;
    }

    if (normalizedName === 'clarify') {
        return null;
    }

    return target;
}

function inferCommandIntent(command: string | null): ToolIntent | null {
    if (!command) {
        return null;
    }

    const normalized = command.trim().toLowerCase();

    if (normalized.includes('calendar')) {
        return { kind: 'calendar' };
    }

    if (
        /^(?:bun|npm|pnpm|yarn)\s+(?:test|run\s+test|run\s+lint|run\s+typecheck)\b/u.test(
            normalized
        )
    ) {
        return {
            kind: 'command',
            subject: command,
            subjectVisibility: resolveSubjectVisibility(command, 'command'),
        };
    }

    if (/^(?:rg|grep|ag|ack)\b/u.test(normalized)) {
        return { kind: 'code-search' };
    }

    if (/^(?:find|ls|tree)\b/u.test(normalized)) {
        return { kind: 'file-list' };
    }

    if (/^(?:cat|head|tail|sed|nl)\b/u.test(normalized)) {
        return { kind: 'file-read' };
    }

    return null;
}

function resolveSubjectVisibility(subject: string, kind: ToolIntentKind = 'tool') {
    const normalized = subject.trim();

    if (kind !== 'command') {
        if (
            kind !== 'file-edit' &&
            kind !== 'file-list' &&
            kind !== 'file-read' &&
            kind !== 'subagent'
        ) {
            return 'drawer';
        }

        return normalized.length <= longHeaderSubjectLimit ? 'header' : 'drawer';
    }

    if (
        normalized.length > longHeaderSubjectLimit ||
        normalized.includes('\n') ||
        normalized.includes("<<'") ||
        normalized.includes('<<') ||
        normalized.includes('${')
    ) {
        return 'drawer';
    }

    return 'header';
}

function isFileEditToolName(normalizedName: string) {
    return matchesAny(normalizedName, [
        'apply_patch',
        'edit_file',
        'file_edit',
        'file_write',
        'replace',
        'workspace_changes',
    ]);
}

function isCodeSearchToolName(normalizedName: string) {
    return (
        normalizedName === 'grep' ||
        normalizedName === 'search' ||
        normalizedName === 'rg' ||
        matchesAny(normalizedName, ['file_search', 'search_file'])
    );
}

function isFileReadToolName(normalizedName: string) {
    return normalizedName === 'read' || matchesAny(normalizedName, ['file_read']);
}

function matchesAny(value: string, needles: string[]) {
    return needles.some((needle) => value.includes(needle));
}
