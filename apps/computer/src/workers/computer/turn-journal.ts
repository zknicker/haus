import { readdir } from 'node:fs/promises';
import type { WorkerTurnStartFrame } from '@haus/api';
import { hasCode, readJsonFile, writeDurableJson } from '../durable-json.ts';
import { serialized } from '../serialized.ts';
import { workerLayout, workersRoot } from './layout.ts';
import {
    type ComputerTurnRecord,
    type ComputerWorkerFile,
    canAdvance,
    computerWorkerFileSchema,
} from './turn-record.ts';

export interface ComputerTurnRef {
    turnId: string;
    workerId: string;
}

export class ComputerTurnJournal {
    constructor(
        private readonly dataRoot: string,
        private readonly serverId: string
    ) {}

    layout(workerId: string) {
        return workerLayout(this.dataRoot, this.serverId, workerId);
    }

    async read(workerId: string) {
        const raw = await readJsonFile(this.layout(workerId).turnsFile);
        return raw === null ? null : computerWorkerFileSchema.parse(raw);
    }

    async turn(ref: ComputerTurnRef) {
        return (await this.read(ref.workerId))?.turns[ref.turnId] ?? null;
    }

    accept(frame: WorkerTurnStartFrame) {
        return this.change<ComputerTurnRecord>(frame.workerId, (file) => {
            const existing = file?.turns[frame.turnId];
            if (existing && existing.phase !== 'accepted') {
                return { file, result: existing };
            }
            const turn: ComputerTurnRecord = {
                attempt: frame.attempt,
                frame,
                inputAccepted: false,
                phase: 'accepted',
                sessionId: existing?.sessionId ?? null,
                stopRequested: existing?.stopRequested ?? false,
                workerMdRevisionId: frame.workerMdRevisionId,
            };
            return {
                file: withTurn(file ?? emptyFile(frame.workerId, frame.agentId), frame.turnId, turn),
                result: turn,
            };
        });
    }

    advance(ref: ComputerTurnRef, next: (turn: ComputerTurnRecord) => ComputerTurnRecord) {
        return this.change(ref.workerId, (file) => {
            const turn = file?.turns[ref.turnId];
            if (!(file && turn)) {
                throw new Error(`Worker turn ${ref.turnId} is not journaled here.`);
            }
            const updated = next(turn);
            if (!canAdvance(turn.phase, updated.phase)) {
                throw new Error(
                    `A Worker turn cannot move from ${turn.phase} to ${updated.phase}.`
                );
            }
            return { file: withTurn(file, ref.turnId, updated), result: updated };
        });
    }

    setRepo(workerId: string, repoPath: string) {
        return this.change(workerId, (file) => {
            if (!file) {
                throw new Error(`Worker ${workerId} is not journaled here.`);
            }
            return { file: { ...file, repoPath }, result: undefined };
        });
    }

    async heldWorkerIds() {
        try {
            const entries = await readdir(workersRoot(this.dataRoot, this.serverId), {
                withFileTypes: true,
            });
            return entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .sort();
        } catch (cause) {
            if (hasCode(cause, 'ENOENT')) {
                return [];
            }
            throw cause;
        }
    }

    async unended() {
        const held = await Promise.all(
            (await this.heldWorkerIds()).map(async (workerId) => ({
                file: await this.read(workerId),
                workerId,
            }))
        );
        return held.flatMap(({ file, workerId }) =>
            Object.entries(file?.turns ?? {})
                .filter(([, turn]) => turn.phase !== 'ended')
                .map(([turnId, turn]) => ({ ref: { turnId, workerId }, turn }))
        );
    }

    private change<Result>(
        workerId: string,
        apply: (file: ComputerWorkerFile | null) => {
            file: ComputerWorkerFile | null;
            result: Result;
        }
    ) {
        const path = this.layout(workerId).turnsFile;
        return serialized(path, async () => {
            const current = await this.read(workerId);
            const { file, result } = apply(current);
            if (file && file !== current) {
                await writeDurableJson(path, file);
            }
            return result;
        });
    }
}

function emptyFile(workerId: string, agentId: string) {
    return {
        agentId,
        repoPath: null,
        turns: {},
        version: 1,
        workerId,
    } satisfies ComputerWorkerFile;
}

function withTurn(file: ComputerWorkerFile, turnId: string, turn: ComputerTurnRecord) {
    return { ...file, turns: { ...file.turns, [turnId]: turn } };
}
