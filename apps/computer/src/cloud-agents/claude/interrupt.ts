import { randomUUID } from 'node:crypto';
import { isTerminalCloudAgentStatus } from '@haus/api';
import type { CloudAgentRunRef } from '../provider.ts';
import type { ClaudeCloudComputer } from './bootstrap.ts';
import {
    type ClaudeController,
    type ClaudeControllerEvent,
    createClaudeController,
} from './controller.ts';
import { type ClaudeInterruptIntent, ClaudeInterruptJournal } from './interrupt-journal.ts';
import { reconcileClaudeTasks } from './interrupt-tasks.ts';
import { readClaudeCloudSnapshot } from './snapshot.ts';

/** The daemon owns retry clocks; each call makes at most one durable controller transition. */
export async function interruptClaudeCloud(
    computer: ClaudeCloudComputer,
    ref: CloudAgentRunRef,
    signal?: AbortSignal,
    controller: ClaudeController = createClaudeController()
): Promise<void> {
    const snapshot = await readClaudeCloudSnapshot(computer, ref, signal);
    if (isTerminalCloudAgentStatus(snapshot.run.status)) {
        return;
    }
    const activeSnapshot = await cancellationEvidence(computer, ref, snapshot, signal);
    const stamp = snapshot.work.cancelRequestedAt;
    if (!stamp) {
        throw new Error('Native Claude interruption requires a Server cancellation fence.');
    }
    const journal = new ClaudeInterruptJournal(
        computer.dataRoot,
        computer.serverId,
        ref.workId,
        stamp
    );
    const intent =
        (await journal.intent()) ??
        (await admitIntent(ref, snapshot, activeSnapshot, stamp, journal, controller, signal));
    if (
        intent.workId !== ref.workId ||
        intent.cancelRequestedAt !== stamp ||
        !intent.runIds.includes(ref.runId)
    ) {
        throw new Error('Native interruption belongs to another cancellation.');
    }
    if (await journal.receipt()) {
        return;
    }
    const events = await controller.events(intent.sessionId, intent.boundary, signal);
    assertPrompt(events, intent.promptId, intent.boundary);
    if (!(await reconcileClaudeTasks(journal, intent, events, controller, signal))) {
        return;
    }
    const response = events.find((event) => event.requestId === intent.requestId);
    if (response) {
        if (!response.success || response.stillQueued !== 0) {
            throw new Error('Native Claude did not confirm a complete interruption.');
        }
        assertPrompt(events, intent.promptId, intent.boundary);
        const session = await controller.session(intent.sessionId, signal);
        if (session.status !== 'idle') {
            return;
        }
        const current = await readClaudeCloudSnapshot(computer, ref, signal);
        await cancellationEvidence(computer, ref, current, signal);
        if (current.work.cancelRequestedAt !== stamp) {
            throw new Error('Native cancellation was superseded before confirmation.');
        }
        await journal.confirm({
            requestId: intent.requestId,
            eventUuid: intent.eventUuid,
            responseUuid: response.uuid,
            responseSequence: response.sequence,
            confirmedAt: new Date().toISOString(),
        });
        return;
    }
    // The permanent dispatch claim survives an ambiguous POST. Recovery only reads its receipt.
    if (await journal.dispatch()) {
        const current = await readClaudeCloudSnapshot(computer, ref, signal);
        await cancellationEvidence(computer, ref, current, signal);
        if (current.work.cancelRequestedAt !== stamp) {
            throw new Error('Native cancellation was superseded before delivery.');
        }
        assertPrompt(
            await controller.events(intent.sessionId, intent.boundary, signal),
            intent.promptId,
            intent.boundary
        );
        await controller.interrupt(intent.sessionId, intent, signal);
    }
}

export async function confirmedClaudeInterrupt(
    computer: ClaudeCloudComputer,
    ref: CloudAgentRunRef,
    stamp: string | null
) {
    if (!stamp) {
        return null;
    }
    const journal = new ClaudeInterruptJournal(
        computer.dataRoot,
        computer.serverId,
        ref.workId,
        stamp
    );
    const intent = await journal.intent();
    if (!intent?.runIds.includes(ref.runId)) {
        return null;
    }
    return journal.receipt();
}

function assertPrompt(events: ClaudeControllerEvent[], expected: string | null, boundary?: string) {
    const latest = events.find((event) => event.promptId !== undefined);
    if (
        latest?.promptId &&
        latest.promptId !== expected &&
        (!boundary || BigInt(latest.sequence) > BigInt(boundary))
    ) {
        throw new Error('A newer native Claude prompt makes this interruption stale.');
    }
    if (!boundary && expected && latest?.promptId !== expected) {
        throw new Error('The native Claude prompt identity is not confirmed.');
    }
}
function activeTasks(events: ClaudeControllerEvent[]): string[] {
    const tasks = new Map<string, boolean>();
    for (const event of events) {
        if (event.task && !tasks.has(event.task.id)) {
            tasks.set(event.task.id, event.task.terminal);
        }
    }
    return [...tasks.entries()].filter(([, stopped]) => !stopped).map(([id]) => id);
}

async function admitIntent(
    ref: CloudAgentRunRef,
    snapshot: Awaited<ReturnType<typeof readClaudeCloudSnapshot>>,
    activeSnapshot: Awaited<ReturnType<typeof readClaudeCloudSnapshot>>,
    stamp: string,
    journal: ClaudeInterruptJournal,
    controller: ClaudeController,
    signal?: AbortSignal
): Promise<ClaudeInterruptIntent> {
    if (!snapshot.work.providerAgentId) {
        throw new Error('The hosted Claude identity is not confirmed.');
    }
    const session = await controller.session(snapshot.work.providerAgentId, signal);
    const events = await controller.events(session.id, undefined, signal);
    const runIds = snapshot.cancellation.runIds;
    const latest = events.find((event) => event.promptId !== undefined);
    const taggedPrompt =
        latest?.workRun?.workId === ref.workId && runIds.includes(latest.workRun.runId)
            ? (latest.promptId ?? null)
            : null;
    const promptId =
        taggedPrompt ??
        activeSnapshot.prompts[0]?.promptId ??
        activeSnapshot.run.providerRunId ??
        ref.providerRunId;
    if (!promptId) {
        throw new Error('The native Claude prompt identity is not confirmed.');
    }
    assertPrompt(events, promptId);
    return await journal.admit({
        workId: ref.workId,
        cancelRequestedAt: stamp,
        sessionId: session.id,
        runIds,
        promptId,
        requestId: randomUUID(),
        eventUuid: randomUUID(),
        boundary: events[0]?.sequence ?? '0',
        activeTasks: activeTasks(events),
    });
}

function assertNoKnownSchedules(snapshot: Awaited<ReturnType<typeof readClaudeCloudSnapshot>>) {
    if ((snapshot.stopEvidence?.sessionCrons ?? 0) > 0) {
        throw new Error(
            'Claude scheduled work requires native cleanup before Haus can confirm cancellation.'
        );
    }
}

async function cancellationEvidence(
    computer: ClaudeCloudComputer,
    ref: CloudAgentRunRef,
    snapshot: Awaited<ReturnType<typeof readClaudeCloudSnapshot>>,
    signal?: AbortSignal
) {
    assertNoKnownSchedules(snapshot);
    const activeRunId = snapshot.cancellation.activeRunId;
    const active =
        activeRunId && activeRunId !== ref.runId
            ? await readClaudeCloudSnapshot(computer, { ...ref, runId: activeRunId }, signal)
            : snapshot;
    if (active.work.cancelRequestedAt !== snapshot.work.cancelRequestedAt) {
        throw new Error('Native cancellation evidence belongs to another fence.');
    }
    assertNoKnownSchedules(active);
    return active;
}
