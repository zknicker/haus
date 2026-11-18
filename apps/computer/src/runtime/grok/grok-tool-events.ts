import * as z from 'zod';
import type { TurnEvent } from '../turn-event.ts';
import { type GrokToolIdentity, grokHostToolOutput, grokToolIdentity } from './grok-tool-names.ts';
import type { WorkspacePaths } from './workspace-paths.ts';

/** The ACP `tool_call` / `tool_call_update` fields the driver reads; Grok sends more. */
const toolUpdateSchema = z.looseObject({
    _meta: z.unknown().optional(),
    content: z.array(z.unknown()).nullish(),
    kind: z.string().nullish(),
    locations: z.array(z.looseObject({ path: z.string() })).nullish(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
    sessionUpdate: z.enum(['tool_call', 'tool_call_update']),
    status: z.string().nullish(),
    title: z.string().nullish(),
    toolCallId: z.string().min(1),
});

type ToolUpdate = z.infer<typeof toolUpdateSchema>;

const diffSchema = z.looseObject({
    newText: z.string(),
    oldText: z.string().nullish(),
    path: z.string().min(1),
    type: z.literal('diff'),
});

interface ToolState {
    content?: unknown[];
    emittedResult: boolean;
    readonly filePaths: Set<string>;
    identity?: GrokToolIdentity;
    input?: unknown;
    kind?: string;
    locations?: readonly { path: string }[];
    meta?: unknown;
    rawOutput?: unknown;
    status?: string;
    title?: string;
}

const TERMINAL = new Set(['completed', 'failed']);

/**
 * Folds ACP tool updates into Haus tool events: one `tool-call` when the call first carries its
 * input, a synthetic `fileChange` per edited file (tagged with its source call), and one
 * `tool-result` at the terminal status.
 */
export function createGrokToolTracker(options: { hostServerName: string; paths: WorkspacePaths }) {
    const tools = new Map<string, ToolState>();
    return {
        /** Events for one tool update; `[]` when it changes nothing Haus reports. */
        update(raw: unknown): TurnEvent[] {
            const parsed = toolUpdateSchema.safeParse(raw);
            if (!parsed.success) {
                return [];
            }
            const update = parsed.data;
            const state = tools.get(update.toolCallId) ?? {
                emittedResult: false,
                filePaths: new Set(),
            };
            tools.set(update.toolCallId, state);
            merge(state, update);
            const events: TurnEvent[] = [];
            if (!state.identity) {
                state.identity = grokToolIdentity({
                    hostServerName: options.hostServerName,
                    meta: state.meta,
                    rawInput: state.input,
                    title: state.title,
                });
                events.push(callEvent(update.toolCallId, state, options.paths));
            }
            if (state.identity.kind === 'builtin') {
                events.push(...fileChanges(update.toolCallId, state, options.paths));
            }
            if (!state.emittedResult && state.status && TERMINAL.has(state.status)) {
                state.emittedResult = true;
                events.push(resultEvent(update.toolCallId, state, options.paths));
            }
            return events;
        },
    };
}

function merge(state: ToolState, update: ToolUpdate) {
    state.content = update.content ?? state.content;
    state.kind = update.kind ?? state.kind;
    state.locations = update.locations ?? state.locations;
    state.meta = update._meta ?? state.meta;
    state.rawOutput = update.rawOutput ?? state.rawOutput;
    state.status = update.status ?? state.status;
    state.title = update.title ?? state.title;
    // The model's own arguments arrive first; later updates restate them with Grok's `variant`.
    if (state.input === undefined && update.rawInput !== undefined) {
        state.input = withoutVariant(update.rawInput);
    }
}

function callEvent(toolCallId: string, state: ToolState, paths: WorkspacePaths): TurnEvent {
    const identity = state.identity as GrokToolIdentity;
    if (identity.kind === 'host') {
        return {
            input: identity.input,
            toolCallId,
            toolName: identity.toolName,
            type: 'tool-call',
        };
    }
    return {
        input: paths.strip(state.input ?? {}),
        providerExecuted: true,
        toolCallId,
        toolName: identity.toolName,
        type: 'tool-call',
        ...(identity.nativeName ? { nativeName: identity.nativeName } : {}),
    };
}

function resultEvent(toolCallId: string, state: ToolState, paths: WorkspacePaths): TurnEvent {
    const identity = state.identity as GrokToolIdentity;
    // A failed call that reports a command's exit code ran; the exit code is its outcome (Raft).
    const isError = state.status === 'failed' && !reportsExitCode(state.rawOutput);
    if (identity.kind === 'host') {
        return {
            output: grokHostToolOutput(state.rawOutput),
            toolCallId,
            toolName: identity.toolName,
            type: 'tool-result',
            ...(isError ? { isError } : {}),
        };
    }
    return {
        output: paths.strip(state.rawOutput ?? state.content ?? {}),
        providerExecuted: true,
        toolCallId,
        toolName: identity.toolName,
        type: 'tool-result',
        ...(identity.nativeName ? { nativeName: identity.nativeName } : {}),
        ...(isError ? { isError } : {}),
    };
}

/** One synthetic `fileChange` call and result per newly edited file, folded into its source. */
function fileChanges(toolCallId: string, state: ToolState, paths: WorkspacePaths): TurnEvent[] {
    const changes: { event: 'create' | 'modify'; path: string }[] = [];
    for (const item of state.content ?? []) {
        const diff = diffSchema.safeParse(item);
        if (diff.success) {
            const created = diff.data.oldText == null || diff.data.oldText === '';
            changes.push({ event: created ? 'create' : 'modify', path: diff.data.path });
        }
    }
    if (state.kind === 'edit') {
        for (const location of state.locations ?? []) {
            changes.push({ event: 'modify', path: location.path });
        }
    }
    return changes.flatMap(({ event, path }) => {
        const relative = paths.relative(path);
        if (state.filePaths.has(relative)) {
            return [];
        }
        state.filePaths.add(relative);
        const id = `${toolCallId}#file-${state.filePaths.size}`;
        const payload = { event, path: relative };
        const facts = {
            dynamic: true,
            providerExecuted: true,
            toolCallId: id,
            toolName: 'fileChange',
        };
        return [
            { ...facts, input: payload, sourceToolCallId: toolCallId, type: 'tool-call' as const },
            { ...facts, output: payload, type: 'tool-result' as const },
        ];
    });
}

function reportsExitCode(rawOutput: unknown): boolean {
    const output = z.looseObject({ exit_code: z.number().int() }).safeParse(rawOutput);
    const camel = z.looseObject({ exitCode: z.number().int() }).safeParse(rawOutput);
    return output.success || camel.success;
}

function withoutVariant(input: unknown): unknown {
    if (
        typeof input !== 'object' ||
        input === null ||
        Array.isArray(input) ||
        !('variant' in input)
    ) {
        return input;
    }
    const { variant: _variant, ...rest } = input as Record<string, unknown>;
    return rest;
}
