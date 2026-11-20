import type { WorkerHeldFrame, WorkerTurnStartFrame } from '@haus/api';
import type { PullRequestReader } from '../github/pull-request-reader.ts';
import type { WorkerServer } from './credentials.ts';
import { type WorkerDriverFactory, workerDriverFactory } from './harness.ts';
import { removeTree } from './remove-tree.ts';
import type { RepoOptions } from './repos.ts';
import {
    type ComputerPlaceContext,
    type ComputerPlaceFrame,
    endBeforeLaunch,
    finishTurn,
    sendEnded,
} from './turn-finish.ts';
import { ComputerTurnJournal, type ComputerTurnRef } from './turn-journal.ts';
import { type ActiveTurn, launchComputerTurn, shutdownReason } from './turn-launch.ts';
import type { ComputerTurnRecord } from './turn-record.ts';
import { removeWorkerWorktree } from './worktree.ts';

export interface ComputerPlaceOptions {
    dataRoot: string;
    driver?: WorkerDriverFactory;
    now?: () => number;
    reader: PullRequestReader;
    repos?: Omit<RepoOptions, 'dataRoot' | 'signal'>;
    server: WorkerServer;
    serverId: string;
}

type Running = ActiveTurn & { done: Promise<void>; workerId: string };

export class ComputerWorkerPlace {
    private readonly active = new Map<string, Running>();
    private send: ((frame: ComputerPlaceFrame) => unknown) | null = null;
    private readonly context: ComputerPlaceContext;
    readonly journal: ComputerTurnJournal;

    constructor(options: ComputerPlaceOptions) {
        this.journal = new ComputerTurnJournal(options.dataRoot, options.serverId);
        this.context = {
            driver: options.driver ?? workerDriverFactory(),
            journal: this.journal,
            now: options.now ?? Date.now,
            reader: options.reader,
            repos: { ...options.repos, dataRoot: options.dataRoot },
            send: (frame) => this.send?.(frame),
            server: options.server,
        };
    }

    attach(send: (frame: ComputerPlaceFrame) => unknown) {
        this.send = send;
    }

    detach() {
        this.send = null;
    }

    async connected() {
        const unended = await this.journal.unended().catch((cause: unknown) => {
            logFailure('worker.computer-recovery', null, cause);
            return [];
        });
        for (const { ref, turn } of unended) {
            if (!this.active.has(ref.turnId)) {
                await this.recover(ref, turn).catch((cause: unknown) =>
                    logFailure('worker.computer-recovery', ref, cause)
                );
            }
        }
        const held: WorkerHeldFrame = {
            type: 'worker-held',
            workerIds: await this.journal.heldWorkerIds(),
        };
        this.context.send(held);
    }

    async accept(frame: WorkerTurnStartFrame) {
        const turn = await this.journal.accept(frame);
        this.context.send({
            attempt: frame.attempt,
            turnId: frame.turnId,
            type: 'worker-turn-accepted',
        });
        if (turn.phase === 'accepted') {
            this.launch(frame);
        } else {
            sendEnded(this.context, refOf(frame), turn);
        }
    }

    async stop(ref: ComputerTurnRef) {
        const turn = await this.journal.turn(ref);
        if (!turn || turn.phase === 'ended') {
            if (turn) {
                sendEnded(this.context, ref, turn);
            }
            return;
        }
        await this.journal.advance(ref, (current) => ({ ...current, stopRequested: true }));
        const running = this.active.get(ref.turnId);
        if (running) {
            await this.end(running, 'stop');
        } else if (turn.phase === 'accepted') {
            await endBeforeLaunch(this.context, ref, {
                branch: turn.frame.checkout?.branch ?? null,
                detail: null,
                exit: 'stopped',
            });
        }
    }

    async reconcile(entries: Array<ComputerTurnRef & { stopRequested: boolean }>) {
        for (const entry of entries) {
            const turn = await this.journal.turn(entry);
            if (!turn) {
                continue;
            }
            if (turn.sessionId) {
                this.context.send({
                    sessionId: turn.sessionId,
                    turnId: entry.turnId,
                    type: 'worker-turn-session',
                });
            }
            if (turn.inputAccepted) {
                this.context.send({
                    attempt: turn.attempt,
                    turnId: entry.turnId,
                    type: 'worker-turn-input-accepted',
                    workerMdRevisionId: turn.workerMdRevisionId,
                });
            }
            if (entry.stopRequested) {
                await this.stop(entry);
            } else {
                sendEnded(this.context, entry, turn);
            }
        }
    }

    async close(workerId: string) {
        await Promise.all(
            [...this.active.values()]
                .filter((running) => running.workerId === workerId)
                .map((running) => this.end(running, 'stop'))
        );
        const layout = this.journal.layout(workerId);
        const file = await this.journal.read(workerId).catch(() => null);
        await removeWorkerWorktree({ checkout: layout.checkout, repoPath: file?.repoPath ?? null });
        await removeTree(layout.root);
    }

    async shutdown() {
        await Promise.all(
            [...this.active.values()].map((running) => this.end(running, shutdownReason))
        );
    }

    private async recover(ref: ComputerTurnRef, turn: ComputerTurnRecord) {
        if (turn.phase === 'accepted') {
            this.launch(turn.frame);
        } else if (turn.phase === 'credentialed') {
            await endBeforeLaunch(this.context, ref, {
                branch: turn.frame.checkout?.branch ?? null,
                detail: 'The Computer restarted before the harness started.',
                exit: 'crashed-before-launch',
            });
        } else if (turn.phase === 'running') {
            await finishTurn(this.context, ref, {
                branch: turn.frame.checkout?.branch ?? null,
                detail: 'The Computer lost the harness process.',
                exit: 'uncertain',
            });
        } else if (turn.phase === 'pushing') {
            await finishTurn(this.context, ref, null);
        }
    }

    private launch(frame: WorkerTurnStartFrame) {
        if (this.active.has(frame.turnId)) {
            return;
        }
        const running: Running = {
            abort: new AbortController(),
            done: Promise.resolve(),
            session: null,
            workerId: frame.workerId,
        };
        this.active.set(frame.turnId, running);
        running.done = launchComputerTurn(this.context, frame, running)
            .catch((cause: unknown) => logFailure('worker.computer-turn', refOf(frame), cause))
            .finally(() => this.active.delete(frame.turnId));
    }

    private async end(running: Running, reason: string) {
        running.abort.abort(reason);
        await running.session?.destroy().catch(() => undefined);
        await running.done;
    }
}

function refOf(frame: WorkerTurnStartFrame) {
    return { turnId: frame.turnId, workerId: frame.workerId };
}

function logFailure(operation: string, ref: ComputerTurnRef | null, cause: unknown) {
    console.error('Worker turn did not finish.', {
        cause: cause instanceof Error ? cause.message : String(cause),
        operation,
        turnId: ref?.turnId ?? null,
        workerId: ref?.workerId ?? null,
    });
}
