import type { AgentActivityRun } from '../agent-activity-run.ts';
import { createAcpReadSteps } from './acp-read-steps.ts';
import {
    type ComputerActivityRegistry,
    createComputerActivityRegistry,
} from './activity-registry.ts';
import type { ComputerToolActivity, ComputerToolClassification } from './activity-tool-fixtures.ts';
import type { ComputerExecutionJournal } from './execution-journal.ts';
import { createFileChangeFold } from './file-change-fold.ts';
import {
    createGeneratedImageSteps,
    type NativeImageToolAction,
    nativeImageToolAction,
} from './generated-images.ts';
import { observeReasoningPart } from './reasoning-capture.ts';
import { createSubagentSteps, delegationOperationId } from './subagent-steps.ts';
import { describeFileChange, describeToolAction } from './thought-action.ts';
import type { AgentThoughtNarrator } from './thought-narrator.ts';
import { createToolFindings } from './thought-result.ts';

export function createComputerActivityProjector(input: {
    activity: AgentActivityRun;
    journal?: ComputerExecutionJournal;
    registry: ComputerActivityRegistry;
    runtimeId: string;
    thoughts?: AgentThoughtNarrator;
    /** Absolute Agent workspace, so an ACP read's file journals workspace-relative. */
    workspaceDir?: string;
}) {
    const skipped = new Set<string>();
    const calls: ToolCalls = {
        fileChanges: createFileChangeFold(skipped),
        findings: createToolFindings(input.thoughts),
        images: createGeneratedImageSteps(input),
        pending: new Map(),
        reads: createAcpReadSteps(input.workspaceDir),
        skipped,
        subagents: createSubagentSteps(input.journal),
    };
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
            calls.fileChanges.clear();
            calls.findings.clear();
            calls.reads.clear();
            calls.subagents.clear();
            await input.journal?.flushReasoning();
        },
        async observe(part: unknown) {
            if (!isRecord(part) || typeof part.type !== 'string') {
                return;
            }
            if (part.type === 'raw') {
                calls.reads.observeRaw(part);
                await calls.subagents.observeRaw(part);
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
            input.thoughts?.observe(part);
            await observeReasoningPart(part, input.journal);
        },
    };
}

export function createHarnessActivityProjector(
    input: Omit<Parameters<typeof createComputerActivityProjector>[0], 'registry'> & {
        journal: ComputerExecutionJournal;
    }
) {
    const registry = createComputerActivityRegistry();
    registry.registerHausHostTool({ category: 'browsing', name: 'browser', toolRef: 'browser' });
    return createComputerActivityProjector({ ...input, registry });
}

async function observeToolCall(
    part: Record<string, unknown>,
    input: {
        activity: AgentActivityRun;
        journal?: ComputerExecutionJournal;
        registry: ComputerActivityRegistry;
        runtimeId: string;
        thoughts?: AgentThoughtNarrator;
    },
    calls: ToolCalls
) {
    const toolCallId = stringValue(part.toolCallId);
    const toolName = stringValue(part.toolName);
    // A sub-agent's own calls are journal evidence only, recorded from raw messages.
    if (!(toolCallId && toolName) || calls.subagents.isChild(toolCallId)) {
        return;
    }
    if (await calls.fileChanges.observeCall({ part, toolCallId, toolName }, input.journal)) {
        input.thoughts?.observeAction(describeFileChange(part.input));
        return;
    }
    const readPath = calls.reads.claim(toolCallId, part);
    const nativeName = stringValue(part.nativeName);
    const classification: ComputerToolClassification = readPath
        ? { category: 'reading_files', outcome: 'activity' }
        : input.registry.classify({
              dynamic: part.dynamic === true,
              input: part.input,
              invalid: part.invalid === true,
              nativeName,
              providerExecuted: part.providerExecuted === true,
              runtimeId: input.runtimeId,
              toolName,
          });
    calls.findings.started(
        toolCallId,
        classification,
        describeToolAction({
            classification,
            input: part.input,
            nativeName,
            readPath,
            runtimeId: input.runtimeId,
            toolName,
        })
    );
    await startToolActivity({
        activity: input.activity,
        calls,
        classification,
        media: mediaOperationCategory(nativeImageToolAction(input.runtimeId, toolName)),
        toolCallId,
    });
    await input.journal?.recordToolCall({
        input: readPath ? { path: readPath } : part.input,
        nativeName: readPath ? toolName : stringValue(part.nativeName),
        toolCallId,
        toolName: calls.reads.journalName(toolCallId, toolName),
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
    if (
        !(toolCallId && toolName) ||
        calls.subagents.isChild(toolCallId) ||
        calls.fileChanges.absorbsResult(toolCallId)
    ) {
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
        media: mediaOperationCategory(nativeImageToolAction(input.runtimeId, toolName)),
        toolCallId,
    });
    const failed = part.type === 'tool-error' || part.isError === true;
    const isPreliminary = part.preliminary === true;
    // The translated stream carries payloads on `output`; `tool-error` on `error`.
    const output =
        part.type === 'tool-error'
            ? part.error
            : isPreliminary
              ? part.output
              : await calls.images.settle(toolName, part.output, failed);
    await input.journal?.recordToolResult({
        isError: failed,
        nativeName: stringValue(part.nativeName),
        output,
        preliminary: isPreliminary,
        toolCallId,
        toolName: calls.reads.journalName(
            toolCallId,
            calls.fileChanges.journalName(toolCallId, toolName)
        ),
    });
    if (isPreliminary) {
        return;
    }
    if (calls.pending.get(toolCallId)?.category === 'delegating') {
        await calls.subagents.observeResult(toolCallId, part.output);
    }
    calls.findings.finished(toolCallId, output, failed);
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
    /** A runtime-native image or video tool: live `using_tool`, counted as its media kind. */
    media: MediaOperationCategory | undefined;
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
        ...(input.classification.category === 'delegating'
            ? { operationId: delegationOperationId(input.toolCallId) }
            : {}),
        ...(input.media ? { summaryCategory: input.media } : {}),
        ...(input.classification.toolRef ? { toolRef: input.classification.toolRef } : {}),
    });
}

/** Open tool activities, and calls deliberately kept out of Activity until they settle. */
interface ToolCalls {
    fileChanges: ReturnType<typeof createFileChangeFold>;
    findings: ReturnType<typeof createToolFindings>;
    images: ReturnType<typeof createGeneratedImageSteps>;
    pending: Map<string, ComputerToolActivity>;
    reads: ReturnType<typeof createAcpReadSteps>;
    skipped: Set<string>;
    subagents: ReturnType<typeof createSubagentSteps>;
}

type MediaOperationCategory = 'generating_image' | 'generating_video';

function mediaOperationCategory(
    action: NativeImageToolAction | undefined
): MediaOperationCategory | undefined {
    if (!action) {
        return;
    }
    return action === 'video' ? 'generating_video' : 'generating_image';
}

function toolActivityKey(toolCallId: string): string {
    return `tool:${toolCallId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
