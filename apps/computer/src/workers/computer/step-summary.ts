import {
    type WorkerStep,
    type WorkerTurnStepsFrame,
    type WorkerStepKind,
    computerKnownSecrets,
    createJournalRedactor,
    workerStepOutputMaxLength,
    workerStepsRetained,
} from '@haus/api';
import type { TurnEvent } from '../../runtime/turn-event.ts';
import { activityIntervalMs } from './activity.ts';

const labelMaxLength = 200;

const kindByTool: Readonly<Record<string, WorkerStepKind>> = {
    bash: 'run',
    delete: 'edit',
    edit: 'edit',
    filechange: 'edit',
    glob: 'search',
    grep: 'search',
    ls: 'search',
    multiedit: 'edit',
    notebookedit: 'edit',
    read: 'read',
    shell: 'run',
    webfetch: 'read',
    websearch: 'search',
    write: 'edit',
};

const labelKeys: Readonly<Record<WorkerStepKind, readonly string[]>> = {
    edit: ['file_path', 'path', 'notebook_path'],
    read: ['file_path', 'path', 'url'],
    run: ['command'],
    search: ['pattern', 'query', 'path'],
};

export function workerStepRecorder(redact: (text: string) => string) {
    const steps = new Map<string, WorkerStep>();
    const record = (toolCallId: string, step: WorkerStep) => {
        steps.set(toolCallId, step);
        for (const oldest of steps.keys()) {
            if (steps.size <= workerStepsRetained) {
                break;
            }
            steps.delete(oldest);
        }
        return true;
    };
    return {
        offer(event: TurnEvent) {
            if (event.type === 'tool-read-location') {
                return record(event.toolCallId, opened('read', label(event.path, redact), null));
            }
            if (event.type === 'tool-call') {
                if (event.invalid && steps.has(event.toolCallId)) {
                    return false;
                }
                const kind = kindOf(event.toolName) ?? kindOf(event.nativeName ?? '');
                const text = kind ? labelOf(kind, event.input) : null;
                return kind && text
                    ? record(event.toolCallId, opened(kind, label(text, redact), event.input))
                    : false;
            }
            if (event.type === 'tool-result' && event.preliminary) {
                return false;
            }
            if (event.type !== 'tool-result' && event.type !== 'tool-error') {
                return false;
            }
            const step = steps.get(event.toolCallId);
            if (!step) {
                return false;
            }
            const failed = event.type === 'tool-error' || event.isError === true;
            const output = event.type === 'tool-error' ? event.error : event.output;
            return record(event.toolCallId, {
                ...step,
                output: step.kind === 'run' ? tail(outputText(output), redact) : null,
                state: failed ? 'failed' : 'done',
            });
        },
        steps: () => [...steps.values()],
    };
}

export function workerStepReporter(options: {
    attempt: number;
    now: () => number;
    redact: (text: string) => string;
    send: (frame: WorkerTurnStepsFrame) => void;
    turnId: string;
}) {
    const recorder = workerStepRecorder(options.redact);
    let sentAt = Number.NEGATIVE_INFINITY;
    let dirty = false;
    const flush = () => {
        if (!dirty) {
            return;
        }
        options.send({
            attempt: options.attempt,
            steps: recorder.steps(),
            turnId: options.turnId,
            type: 'worker-turn-steps',
        });
        dirty = false;
        sentAt = options.now();
    };
    return {
        flush,
        offer(event: TurnEvent) {
            dirty = recorder.offer(event) || dirty;
            if (options.now() - sentAt >= activityIntervalMs) {
                flush();
            }
        },
    };
}

export function workerTextMask(options: {
    checkout: string;
    drive: string;
    environment: Record<string, string | undefined>;
    token: string;
}) {
    const redact = createJournalRedactor(computerKnownSecrets(options.token, options.environment));
    return (text: string) =>
        redact(text)
            .replaceAll(`${options.drive}/`, 'drive/')
            .replaceAll(options.drive, 'drive')
            .replaceAll(`${options.checkout}/`, '')
            .replaceAll(options.checkout, '.');
}

function opened(kind: WorkerStepKind, text: string, input: unknown) {
    const counts = kind === 'edit' ? lineCounts(input) : { additions: null, deletions: null };
    return { ...counts, kind, label: text, output: null, state: 'running' } satisfies WorkerStep;
}

function kindOf(toolName: string) {
    return kindByTool[toolName.toLowerCase()] ?? null;
}

function labelOf(kind: WorkerStepKind, input: unknown) {
    const fields = recordOf(input);
    for (const key of labelKeys[kind]) {
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

function lineCounts(input: unknown) {
    const fields = recordOf(input);
    if (typeof fields.additions === 'number' && typeof fields.deletions === 'number') {
        return { additions: fields.additions, deletions: fields.deletions };
    }
    if (Array.isArray(fields.edits)) {
        const edits = fields.edits.map(replacementCounts);
        return {
            additions: edits.reduce((sum, edit) => sum + edit.additions, 0),
            deletions: edits.reduce((sum, edit) => sum + edit.deletions, 0),
        };
    }
    if (typeof fields.old_string === 'string' && typeof fields.new_string === 'string') {
        return replacementCounts(fields);
    }
    if (typeof fields.content === 'string') {
        return { additions: lineCount(fields.content), deletions: null };
    }
    return { additions: null, deletions: null };
}

function replacementCounts(edit: unknown) {
    const fields = recordOf(edit);
    const count = (value: unknown) => (typeof value === 'string' ? lineCount(value) : 0);
    return { additions: count(fields.new_string), deletions: count(fields.old_string) };
}

export function lineCount(text: string) {
    if (text === '') {
        return 0;
    }
    const lines = text.split('\n').length;
    return text.endsWith('\n') ? lines - 1 : lines;
}

function outputText(output: unknown) {
    if (typeof output === 'string') {
        return output;
    }
    const fields = recordOf(output);
    if (typeof fields.formatted_output === 'string') {
        return fields.formatted_output;
    }
    return [fields.stdout, fields.stderr]
        .filter((part): part is string => typeof part === 'string' && part.length > 0)
        .join('\n');
}

function label(text: string, redact: (text: string) => string) {
    const line = redact(text).replaceAll(/\s+/gu, ' ').trim();
    return line.length <= labelMaxLength ? line : `${line.slice(0, labelMaxLength - 1)}…`;
}

function tail(text: string, redact: (text: string) => string) {
    const clean = redact(text).trimEnd();
    if (!clean) {
        return null;
    }
    return clean.length <= workerStepOutputMaxLength
        ? clean
        : `…${clean.slice(clean.length - workerStepOutputMaxLength + 1)}`;
}

function recordOf(value: unknown) {
    const empty: Record<string, unknown> = {};
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : empty;
}
