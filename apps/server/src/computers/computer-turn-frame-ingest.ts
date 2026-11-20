import {
    workerHeldFrameSchema,
    workerTurnActivityFrameSchema,
    workerTurnStepsFrameSchema,
    workerTurnEndedFrameSchema,
    workerTurnInputAcceptedFrameSchema,
    workerTurnSessionFrameSchema,
} from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    acceptComputerTurnInput,
    answerHeldWorkers,
    recordComputerTurnActivity,
    recordComputerTurnSteps,
    recordComputerTurnSession,
} from '../workers/computer-turn-frames.ts';
import { settleComputerTurn } from '../workers/settle-computer-turn.ts';

export async function applyComputerTurnFrame(input: {
    computerId: string;
    db: HausDatabase;
    delivery: AgentDelivery;
    frame: unknown;
    serverId: string;
    storage: ArtifactStorage | null;
}) {
    const { db, frame } = input;
    const scope = { computerId: input.computerId, serverId: input.serverId };
    const ended = workerTurnEndedFrameSchema.safeParse(frame);
    if (ended.success) {
        return await settleComputerTurn(db, input.delivery, input.storage, {
            ...scope,
            frame: ended.data,
        });
    }
    const accepted = workerTurnInputAcceptedFrameSchema.safeParse(frame);
    if (accepted.success) {
        return await acceptComputerTurnInput(db, scope, accepted.data);
    }
    const session = workerTurnSessionFrameSchema.safeParse(frame);
    if (session.success) {
        return await recordComputerTurnSession(db, scope, session.data);
    }
    const activity = workerTurnActivityFrameSchema.safeParse(frame);
    if (activity.success) {
        return await recordComputerTurnActivity(db, scope, activity.data);
    }
    const steps = workerTurnStepsFrameSchema.safeParse(frame);
    if (steps.success) {
        return await recordComputerTurnSteps(db, scope, steps.data);
    }
    const held = workerHeldFrameSchema.safeParse(frame);
    if (held.success) {
        return await answerHeldWorkers(db, scope, held.data);
    }
    return undefined;
}
