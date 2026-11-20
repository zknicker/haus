import type { WorkerRuntime, WorkerTurnStartFrame } from '@haus/api';
import { createJournalRedactor } from '../../execution-journal-upload/journal-redaction.ts';
import type { RuntimeSession } from '../../runtime/driver.ts';
import { activityLine, activityThrottle } from './activity.ts';
import { mintTurnCredential } from './credentials.ts';
import { pullWorkerDrive } from './drive-sync.ts';
import { prepareWorkerCli, workerResumeState } from './harness.ts';
import { resolveWorkerRepo } from './repos.ts';
import { workerStepReporter } from './step-summary.ts';
import {
    bounded,
    type ComputerPlaceContext,
    endBeforeLaunch,
    finishTurn,
    sharedOf,
} from './turn-finish.ts';
import type { ComputerTurnRef } from './turn-journal.ts';
import { addWorkerWorktree, worktreeGitRoots } from './worktree.ts';

export interface ActiveTurn {
    readonly abort: AbortController;
    session: RuntimeSession | null;
}

type Launchable = WorkerTurnStartFrame & {
    checkout: NonNullable<WorkerTurnStartFrame['checkout']>;
    runtime: WorkerRuntime;
};

export async function launchComputerTurn(
    context: ComputerPlaceContext,
    frame: WorkerTurnStartFrame,
    active: ActiveTurn
) {
    const ref = { turnId: frame.turnId, workerId: frame.workerId };
    if (!(frame.checkout && frame.runtime)) {
        await endBeforeLaunch(
            context,
            ref,
            crashed(null, 'The start named no runtime or checkout.')
        );
        return;
    }
    const launchable = { ...frame, checkout: frame.checkout, runtime: frame.runtime };
    let minted: Awaited<ReturnType<typeof mintTurnCredential>>;
    try {
        minted = await mintTurnCredential(context.server, {
            attempt: frame.attempt,
            turnId: frame.turnId,
        });
    } catch (error) {
        await endBeforeLaunch(
            context,
            ref,
            crashed(launchable, `No turn credential: ${messageOf(error)}`)
        );
        return;
    }
    if (minted.state === 'refused') {
        const resent = minted.reason === 'stale-attempt' ? await context.journal.turn(ref) : null;
        if (resent?.phase === 'accepted' && resent.attempt > frame.attempt) {
            await launchComputerTurn(context, resent.frame, active);
            return;
        }
        await endBeforeLaunch(context, ref, {
            branch: frame.checkout.branch,
            detail: minted.reason,
            exit: 'refused',
        });
        return;
    }
    await context.journal.advance(ref, (turn) => ({
        ...sharedOf(turn),
        attempt: frame.attempt,
        frame,
        phase: 'credentialed',
        token: minted.token,
    }));
    let prepared: Awaited<ReturnType<typeof prepare>>;
    try {
        prepared = await prepare(context, launchable, minted.token, active);
        active.abort.signal.throwIfAborted();
    } catch (error) {
        await endBeforeLaunch(
            context,
            ref,
            active.abort.signal.aborted
                ? { branch: frame.checkout.branch, detail: null, exit: stoppedBeforeLaunch(active) }
                : crashed(launchable, messageOf(error))
        );
        return;
    }
    await context.journal.advance(ref, (turn) =>
        turn.phase === 'credentialed' ? { ...turn, phase: 'running' } : turn
    );
    await finishTurn(context, ref, await runHarness(context, launchable, prepared, active));
}

function stoppedBeforeLaunch(active: ActiveTurn) {
    return exitOf(active, 'exited') === 'stopped' ? 'stopped' : 'crashed-before-launch';
}

async function prepare(
    context: ComputerPlaceContext,
    frame: Launchable,
    token: string,
    active: ActiveTurn
) {
    const signal = active.abort.signal;
    const layout = context.journal.layout(frame.workerId);
    const repoPath = await resolveWorkerRepo(frame.checkout, { ...context.repos, signal });
    await context.journal.setRepo(frame.workerId, repoPath);
    await addWorkerWorktree({
        branch: frame.checkout.branch,
        checkout: layout.checkout,
        repoPath,
        signal,
        startingRef: frame.checkout.startingRef,
    });
    const file = await context.journal.read(frame.workerId);
    if (!file) {
        throw new Error(`Worker ${frame.workerId} is not journaled here.`);
    }
    await pullWorkerDrive({ agentId: file.agentId, layout, server: context.server }, token);
    return {
        cwd: layout.checkout,
        env: await prepareWorkerCli(layout, context.server.serverOrigin, token),
        modelId: frame.model.id,
        runtimeId: frame.runtime,
        writableRoots: [
            layout.drive,
            layout.report,
            layout.tmp,
            ...(await worktreeGitRoots(layout.checkout, frame.checkout.branch)),
        ],
    };
}

async function runHarness(
    context: ComputerPlaceContext,
    frame: Launchable,
    launch: Awaited<ReturnType<typeof prepare>>,
    active: ActiveTurn
) {
    const ref = { turnId: frame.turnId, workerId: frame.workerId };
    const branch = frame.checkout.branch;
    const signal = active.abort.signal;
    let accepted = false;
    const acceptInput = async () => {
        if (accepted) {
            return;
        }
        accepted = true;
        await context.journal.advance(ref, (turn) => ({ ...turn, inputAccepted: true }));
        context.send({
            attempt: frame.attempt,
            turnId: frame.turnId,
            type: 'worker-turn-input-accepted',
            workerMdRevisionId: frame.workerMdRevisionId,
        });
    };
    try {
        const session = await context.driver(launch).openSession({
            resumeFrom: workerResumeState(frame.runtime, frame.resumeSessionId),
            sessionId: frame.workerId,
            signal,
        });
        active.session = session;
        await noteSession(context, ref, session.sessionId);
        const turn = await session.startTurn({ prompt: frame.input, signal });
        if (frame.runtime === 'codex') {
            await acceptInput();
        }
        const redact = createJournalRedactor([launch.env.HAUS_WORKER_TOKEN]);
        const offer = activityThrottle({
            now: context.now,
            send: (line) =>
                context.send({ ...line, turnId: frame.turnId, type: 'worker-turn-activity' }),
        });
        const steps = workerStepReporter({
            attempt: frame.attempt,
            now: context.now,
            send: context.send,
            token: launch.env.HAUS_WORKER_TOKEN,
            turnId: frame.turnId,
        });
        let failure: string | null = null;
        for await (const event of turn.events) {
            await acceptInput();
            failure = failureOf(event) ?? failure;
            offer(activityLine(event, redact));
            steps.offer(event);
        }
        steps.flush();
        await turn.settle();
        await session.stop().catch(() => session.destroy());
        return { branch, detail: failure, exit: exitOf(active, 'exited') };
    } catch (error) {
        await active.session?.destroy().catch(() => undefined);
        return {
            branch,
            detail: bounded(messageOf(error)),
            exit: exitOf(active, accepted ? 'exited' : 'crashed-before-launch'),
        };
    }
}

async function noteSession(context: ComputerPlaceContext, ref: ComputerTurnRef, sessionId: string) {
    await context.journal.advance(ref, (turn) => ({ ...turn, sessionId }));
    context.send({ sessionId, turnId: ref.turnId, type: 'worker-turn-session' });
}

export const shutdownReason = 'shutdown';

function exitOf(active: ActiveTurn, otherwise: 'crashed-before-launch' | 'exited') {
    if (!active.abort.signal.aborted) {
        return otherwise;
    }
    return active.abort.signal.reason === shutdownReason
        ? ('uncertain' as const)
        : ('stopped' as const);
}

function failureOf(event: { type: string; error?: unknown; severity?: string; title?: string }) {
    if (event.type === 'error') {
        return bounded(messageOf(event.error));
    }
    return event.type === 'session-failure' && event.severity === 'error' && event.title
        ? bounded(event.title)
        : null;
}

function crashed(frame: Launchable | null, detail: string) {
    return {
        branch: frame?.checkout.branch ?? null,
        detail: bounded(detail),
        exit: 'crashed-before-launch' as const,
    };
}

function messageOf(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    return providerMessage(text) ?? text;
}

export function providerMessage(text: string) {
    try {
        const parsed: unknown = JSON.parse(text);
        const body = typeof parsed === 'object' && parsed !== null ? parsed : {};
        const nested = 'error' in body && typeof body.error === 'object' ? body.error : body;
        return nested && 'message' in nested && typeof nested.message === 'string'
            ? nested.message
            : null;
    } catch {
        return null;
    }
}
