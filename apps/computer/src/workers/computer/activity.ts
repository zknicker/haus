import { workerActivityMaxLength } from '@haus/api';
import type { TurnEvent } from '../../runtime/turn-event.ts';

export const activityIntervalMs = 5000;

const verbs: Record<string, string> = {
    apply_patch: 'Editing',
    bash: 'Running',
    edit: 'Editing',
    fileChange: 'Editing',
    glob: 'Searching',
    grep: 'Searching',
    read: 'Reading',
    webfetch: 'Fetching',
    websearch: 'Searching the web for',
    write: 'Writing',
};

export function activityLine(event: TurnEvent) {
    if (event.type === 'subagent-started') {
        return bounded(`Delegating ${event.description ?? 'a subtask'}`);
    }
    if (event.type !== 'tool-call') {
        return null;
    }
    const name = event.nativeName ?? event.toolName;
    const verb = verbs[name] ?? verbs[name.toLowerCase()];
    const detail = detailOf(event.input);
    if (!verb) {
        return bounded(detail ? `Using ${name}: ${detail}` : `Using ${name}`);
    }
    return bounded(detail ? `${verb} ${detail}` : verb);
}

export function activityThrottle(options: {
    now: () => number;
    send: (line: { at: string; summary: string }) => void;
}) {
    let sentAt = Number.NEGATIVE_INFINITY;
    let pending: string | null = null;
    return (line: string | null) => {
        pending = line ?? pending;
        const now = options.now();
        if (pending === null || now - sentAt < activityIntervalMs) {
            return;
        }
        options.send({ at: new Date(now).toISOString(), summary: pending });
        sentAt = now;
        pending = null;
    };
}

function detailOf(input: unknown) {
    if (typeof input !== 'object' || input === null) {
        return null;
    }
    const fields = input as Record<string, unknown>;
    for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description']) {
        const value = fields[key];
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
        if (Array.isArray(value) && value.every((part) => typeof part === 'string')) {
            return value.join(' ');
        }
    }
    return null;
}

function bounded(text: string) {
    const line = text.replaceAll(/\s+/gu, ' ').trim();
    return line.length <= workerActivityMaxLength
        ? line
        : `${line.slice(0, workerActivityMaxLength - 1).trimEnd()}…`;
}
