import type { ComputerAgentActivityCategory } from '../agent-activity.ts';
import type { AgentActivityRun } from '../agent-activity-run.ts';
import { knownToolCategory, syntheticHarnessToolActivity } from './activity-tool-fixtures.ts';
import type { ComputerExecutionJournal } from './execution-journal.ts';
import { observeReasoningPart } from './reasoning-capture.ts';

export interface HausHostToolRegistration {
    category: Exclude<ComputerAgentActivityCategory, 'starting_work' | 'thinking' | 'working'>;
    name: string;
    toolRef?: string;
}

/** One tool call that opens a semantic activity operation. */
export interface ComputerToolActivity {
    category: ComputerAgentActivityCategory;
    outcome: 'activity';
    toolRef?: string;
}

/**
 * `skip` is a deliberate silence, not a missing mapping: harness bookkeeping
 * such as context compaction is journaled evidence but never agent work, so it
 * must not open an Activity row.
 */
export type ComputerToolClassification = ComputerToolActivity | { outcome: 'skip' };

export interface ComputerActivityRegistry {
    classify(input: {
        dynamic?: boolean;
        invalid?: boolean;
        nativeName?: string;
        providerExecuted?: boolean;
        runtimeId: string;
        toolName: string;
    }): ComputerToolClassification;
    registerHausHostTool(registration: HausHostToolRegistration): void;
}

export function createComputerActivityRegistry(): ComputerActivityRegistry {
    const hostTools = new Map<string, HausHostToolRegistration>();
    return {
        classify(input) {
            const synthetic = syntheticHarnessToolActivity(
                input.toolName,
                input.providerExecuted === true
            );
            if (synthetic) {
                return synthetic === 'skip'
                    ? { outcome: 'skip' }
                    : { category: synthetic, outcome: 'activity' };
            }
            const known = knownToolCategory(input.runtimeId, input.toolName, input.nativeName);
            // A runtime builtin whose input failed its schema is still that builtin
            // (codex-acp sends a parsed file read as `exec_command` with no command).
            if (known && input.invalid && input.providerExecuted) {
                return { category: known, outcome: 'activity' };
            }
            if (input.dynamic || isMcpName(input.toolName) || isMcpName(input.nativeName)) {
                return { category: 'using_tool', outcome: 'activity' };
            }
            const host = hostTools.get(input.nativeName ?? '') ?? hostTools.get(input.toolName);
            if (host) {
                return {
                    category: host.category,
                    outcome: 'activity',
                    ...(host.toolRef ? { toolRef: host.toolRef } : {}),
                };
            }
            return { category: known ?? 'using_tool', outcome: 'activity' };
        },
        registerHausHostTool(registration) {
            hostTools.set(registration.name, registration);
        },
    };
}

export function classifyHausProxyBoundary(
    method: string,
    pathname: string
): ComputerAgentActivityCategory | null {
    if (
        (method === 'GET' &&
            (pathname === '/api/agent/events' ||
                pathname === '/api/agent/history' ||
                pathname === '/api/agent/messages/search' ||
                /^\/api\/agent\/messages\/[^/]+$/u.test(pathname))) ||
        (method === 'POST' && pathname === '/api/agent/messages/search')
    ) {
        return 'checking_messages';
    }
    if (/^\/api\/agent\/browser(?:\/|$)/u.test(pathname)) {
        return 'browsing';
    }
    return null;
}

export function createComputerActivityProjector(input: {
    activity: AgentActivityRun;
    journal?: ComputerExecutionJournal;
    registry: ComputerActivityRegistry;
    runtimeId: string;
}) {
    const calls: ToolCalls = { pending: new Map(), skipped: new Set() };
    const { pending } = calls;
    return {
        async finish(phase: 'completed' | 'failed' | 'interrupted', error?: unknown) {
            if (pending.size > 0) {
                await input.journal?.finishPending(
                    phase === 'interrupted' ? 'interrupted' : 'failed',
                    phase === 'interrupted' ? 'stream_abort' : 'stream_error',
                    error
                );
            }
            if (phase !== 'completed' || pending.size > 0) {
                for (const toolCallId of pending.keys()) {
                    await input.activity.finish(
                        toolActivityKey(toolCallId),
                        phase === 'interrupted' ? 'interrupted' : 'failed'
                    );
                }
            }
            pending.clear();
            calls.skipped.clear();
            await input.journal?.flushReasoning();
        },
        async observe(part: unknown) {
            if (!isRecord(part) || typeof part.type !== 'string') {
                return;
            }
            if (part.type === 'tool-call') {
                await observeToolCall(part, input, calls);
                return;
            }
            if (part.type === 'tool-result' || part.type === 'tool-error') {
                await observeToolOutcome(part, input, calls);
                return;
            }
            await observeReasoningPart(part, input.journal);
        },
    };
}

export function createHarnessActivityProjector(input: {
    activity: AgentActivityRun;
    journal: ComputerExecutionJournal;
    runtimeId: string;
}) {
    const registry = createComputerActivityRegistry();
    registry.registerHausHostTool({ category: 'browsing', name: 'browser', toolRef: 'browser' });
    registry.registerHausHostTool({
        category: 'browsing',
        name: 'web_fetch',
        toolRef: 'web-fetch',
    });
    return createComputerActivityProjector({ ...input, registry });
}

async function observeToolCall(
    part: Record<string, unknown>,
    input: {
        activity: AgentActivityRun;
        journal?: ComputerExecutionJournal;
        registry: ComputerActivityRegistry;
        runtimeId: string;
    },
    calls: ToolCalls
) {
    const toolCallId = stringValue(part.toolCallId);
    const toolName = stringValue(part.toolName);
    if (!(toolCallId && toolName)) {
        return;
    }
    await startToolActivity({
        activity: input.activity,
        calls,
        classification: input.registry.classify({
            dynamic: part.dynamic === true,
            invalid: part.invalid === true,
            nativeName: stringValue(part.nativeName),
            providerExecuted: part.providerExecuted === true,
            runtimeId: input.runtimeId,
            toolName,
        }),
        toolCallId,
    });
    await input.journal?.recordToolCall({
        input: part.input,
        nativeName: stringValue(part.nativeName),
        toolCallId,
        toolName,
    });
}

/** Handles both `tool-result` and the `tool-error` a failed tool call ends on. */
async function observeToolOutcome(
    part: Record<string, unknown>,
    input: {
        activity: AgentActivityRun;
        journal?: ComputerExecutionJournal;
        registry: ComputerActivityRegistry;
        runtimeId: string;
    },
    calls: ToolCalls
) {
    const toolCallId = stringValue(part.toolCallId);
    const toolName = stringValue(part.toolName);
    if (!(toolCallId && toolName)) {
        return;
    }
    await startToolActivity({
        activity: input.activity,
        calls,
        // A provider result need not repeat `providerExecuted`, so a skipped call
        // stays skipped rather than being reclassified from its result.
        classification:
            calls.pending.get(toolCallId) ??
            (calls.skipped.has(toolCallId) ? ({ outcome: 'skip' } as const) : undefined) ??
            input.registry.classify({
                dynamic: part.dynamic === true,
                nativeName: stringValue(part.nativeName),
                providerExecuted: part.providerExecuted === true,
                runtimeId: input.runtimeId,
                toolName,
            }),
        toolCallId,
    });
    const failed = part.type === 'tool-error' || part.isError === true;
    const isPreliminary = part.preliminary === true;
    await input.journal?.recordToolResult({
        isError: failed,
        nativeName: stringValue(part.nativeName),
        // The translated stream carries payloads on `output`; `tool-error` on `error`.
        output: part.type === 'tool-error' ? part.error : part.output,
        preliminary: isPreliminary,
        toolCallId,
        toolName,
    });
    if (isPreliminary) {
        return;
    }
    calls.skipped.delete(toolCallId);
    if (calls.pending.delete(toolCallId)) {
        await input.activity.finish(toolActivityKey(toolCallId), failed ? 'failed' : 'completed');
    }
}

/** No-ops for a skipped tool, so its evidence reaches the journal alone. */
async function startToolActivity(input: {
    activity: AgentActivityRun;
    calls: ToolCalls;
    classification: ComputerToolClassification;
    toolCallId: string;
}) {
    if (input.classification.outcome === 'skip') {
        input.calls.skipped.add(input.toolCallId);
        return;
    }
    if (input.calls.pending.has(input.toolCallId)) {
        return;
    }
    input.calls.pending.set(input.toolCallId, input.classification);
    await input.activity.start({
        category: input.classification.category,
        key: toolActivityKey(input.toolCallId),
        ...(input.classification.toolRef ? { toolRef: input.classification.toolRef } : {}),
    });
}

/** Open tool activities, and calls deliberately kept out of Activity until they settle. */
interface ToolCalls {
    pending: Map<string, ComputerToolActivity>;
    skipped: Set<string>;
}

function toolActivityKey(toolCallId: string): string {
    return `tool:${toolCallId}`;
}

function isMcpName(value: string | undefined): boolean {
    return value?.startsWith('mcp__') ?? false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
