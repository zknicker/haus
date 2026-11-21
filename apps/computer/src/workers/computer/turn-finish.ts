import type {
    WorkerHeldFrame,
    WorkerTurnAcceptedFrame,
    WorkerTurnActivityFrame,
    WorkerTurnEndedFrame,
    WorkerTurnInputAcceptedFrame,
    WorkerTurnSessionFrame,
    WorkerTurnStepsFrame,
} from '@haus/api';
import type { PullRequestReader } from '../github/pull-request-reader.ts';
import type { WorkerServer } from './credentials.ts';
import { pushWorkerDrive } from './drive-sync.ts';
import type { WorkerDriverFactory } from './harness.ts';
import { reportedBranches } from './readings.ts';
import type { RepoOptions } from './repos.ts';
import type { ComputerTurnJournal, ComputerTurnRef } from './turn-journal.ts';
import type { ComputerTurnEnding, ComputerTurnRecord } from './turn-record.ts';

export type ComputerPlaceFrame =
    | WorkerHeldFrame
    | WorkerTurnAcceptedFrame
    | WorkerTurnActivityFrame
    | WorkerTurnEndedFrame
    | WorkerTurnInputAcceptedFrame
    | WorkerTurnSessionFrame
    | WorkerTurnStepsFrame;

export interface ComputerPlaceContext {
    driver: WorkerDriverFactory;
    journal: ComputerTurnJournal;
    now: () => number;
    reader: PullRequestReader;
    repos: Omit<RepoOptions, 'signal'>;
    send: (frame: ComputerPlaceFrame) => void;
    server: WorkerServer;
}

type Ending = Omit<ComputerTurnEnding, 'branches'>;

export async function endBeforeLaunch(
    context: ComputerPlaceContext,
    ref: ComputerTurnRef,
    ending: Ending
) {
    const ended = await context.journal.advance(ref, (turn) => ({
        ...sharedOf(turn),
        ending: { ...ending, branches: [] },
        phase: 'ended',
    }));
    sendEnded(context, ref, ended);
}

export async function finishTurn(
    context: ComputerPlaceContext,
    ref: ComputerTurnRef,
    ending: Ending | null
) {
    const pushing = await context.journal.advance(ref, (turn) =>
        turn.phase === 'pushing' || ending === null
            ? turn
            : { ...sharedOf(turn), ending: { ...ending, branches: [] }, phase: 'pushing' }
    );
    if (pushing.phase !== 'pushing') {
        throw new Error(`Worker turn ${ref.turnId} has no ending to push.`);
    }
    const file = await context.journal.read(ref.workerId);
    const layout = context.journal.layout(ref.workerId);
    const pushed = file
        ? await pushWorkerDrive(
              { agentId: file.agentId, layout, server: context.server },
              ref.turnId
          )
        : 'finished';
    if (pushed === 'retry') {
        return;
    }
    const branches = await reportedBranches({
        branch: pushing.ending.branch,
        layout,
        reader: context.reader,
        turnId: ref.turnId,
    });
    const ended = await context.journal.advance(ref, (turn) => ({
        ...sharedOf(turn),
        ending: { ...pushing.ending, branches },
        phase: 'ended',
    }));
    sendEnded(context, ref, ended);
}

export function sendEnded(
    context: ComputerPlaceContext,
    ref: ComputerTurnRef,
    turn: ComputerTurnRecord
) {
    if (turn.phase !== 'ended') {
        return;
    }
    context.send({
        attempt: turn.attempt,
        branch: turn.ending.branch,
        branches: turn.ending.branches,
        detail: turn.ending.detail,
        exit: turn.ending.exit,
        sessionId: turn.sessionId,
        turnId: ref.turnId,
        type: 'worker-turn-ended',
    } satisfies WorkerTurnEndedFrame);
}

export function resendProgress(
    context: ComputerPlaceContext,
    ref: ComputerTurnRef,
    turn: ComputerTurnRecord
) {
    if (turn.sessionId) {
        context.send({
            sessionId: turn.sessionId,
            turnId: ref.turnId,
            type: 'worker-turn-session',
        });
    }
    if (turn.inputAccepted) {
        context.send({
            attempt: turn.attempt,
            turnId: ref.turnId,
            type: 'worker-turn-input-accepted',
            workerMdRevisionId: turn.workerMdRevisionId,
        });
    }
}

export function sendJournalMissing(
    context: ComputerPlaceContext,
    ref: ComputerTurnRef,
    ending: Pick<WorkerTurnEndedFrame, 'attempt' | 'exit' | 'sessionId'>
) {
    context.send({
        ...ending,
        branch: null,
        branches: [],
        detail: 'journal-missing',
        turnId: ref.turnId,
        type: 'worker-turn-ended',
    } satisfies WorkerTurnEndedFrame);
}

export function sharedOf(turn: ComputerTurnRecord) {
    return {
        attempt: turn.attempt,
        inputAccepted: turn.inputAccepted,
        sessionId: turn.sessionId,
        stopRequested: turn.stopRequested,
        workerMdRevisionId: turn.workerMdRevisionId,
    };
}

export function bounded(detail: string) {
    const line = detail.replaceAll(/\s+/gu, ' ').trim();
    if (!line) {
        return null;
    }
    return line.length <= 500 ? line : `${line.slice(0, 499)}…`;
}
