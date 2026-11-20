import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import {
    workerActivityMaxLength,
    workerBranchNameSchema,
    workerBranchSchema,
    workerRefSchema,
    workerRepositorySchema,
} from './worker-shared.ts';
import { workerTimestampSchema } from './worker-time.ts';

/** Each send or resend of a start is a new attempt; only the current one may launch. */
export const workerTurnAttemptSchema = z.number().int().positive();

export const workerNativeSessionIdSchema = z.string().trim().min(1).max(200);

/**
 * Where a Computer-place turn runs: a `git worktree` of the linked clone at
 * `checkoutPath`, or of a clone in the Computer's data root when it is null,
 * on `branch` from `startingRef` (the remote default branch when null).
 */
export const workerCheckoutSchema = z
    .object({
        branch: workerBranchNameSchema,
        checkoutPath: z.string().min(1).max(1024).nullable(),
        repository: workerRepositorySchema,
        startingRef: workerRefSchema.nullable(),
    })
    .strict();
export type WorkerCheckout = z.infer<typeof workerCheckoutSchema>;

/**
 * Computer to Server: the harness accepted the turn input, so the WORKER.md
 * revision it carried counts as delivered. Ignored unless `attempt` is current.
 */
export const workerTurnInputAcceptedFrameSchema = z
    .object({
        attempt: workerTurnAttemptSchema,
        turnId: idSchema,
        type: z.literal('worker-turn-input-accepted'),
        workerMdRevisionId: idSchema.nullable(),
    })
    .strict();
export type WorkerTurnInputAcceptedFrame = z.infer<typeof workerTurnInputAcceptedFrameSchema>;

/** Computer to Server: the harness allocated its session; sent once, replayed on reconcile. */
export const workerTurnSessionFrameSchema = z
    .object({
        sessionId: workerNativeSessionIdSchema,
        turnId: idSchema,
        type: z.literal('worker-turn-session'),
    })
    .strict();
export type WorkerTurnSessionFrame = z.infer<typeof workerTurnSessionFrameSchema>;

/** Computer to Server: one bounded activity line, at most one every 5 seconds per turn. */
export const workerTurnActivityFrameSchema = z
    .object({
        at: workerTimestampSchema,
        summary: z.string().trim().min(1).max(workerActivityMaxLength),
        turnId: idSchema,
        type: z.literal('worker-turn-activity'),
    })
    .strict();
export type WorkerTurnActivityFrame = z.infer<typeof workerTurnActivityFrameSchema>;

/**
 * How a Computer-place turn's process ended (W3 design R5):
 * - `exited`: the harness process ended on its own;
 * - `crashed-before-launch`: it was credentialed but never ran;
 * - `uncertain`: it was running when the Computer lost it;
 * - `refused`: the credential mint refused, so it never launched;
 * - `stopped`: the Computer killed it on `worker-stop`.
 */
export const workerTurnExits = [
    'exited',
    'crashed-before-launch',
    'uncertain',
    'refused',
    'stopped',
] as const;
export const workerTurnExitSchema = z.enum(workerTurnExits);
export type WorkerTurnExit = z.infer<typeof workerTurnExitSchema>;

/**
 * Computer to Server: the turn's process ended and its Drive push closed. The
 * Server settles from the recorded report draft. `branches` carries bounded
 * `gh pr view` readings of the report's pull requests when the Computer could
 * take them.
 */
export const workerTurnEndedFrameSchema = z
    .object({
        attempt: workerTurnAttemptSchema,
        branch: workerBranchNameSchema.nullable(),
        branches: z.array(workerBranchSchema).max(50),
        detail: z.string().trim().min(1).max(500).nullable(),
        exit: workerTurnExitSchema,
        sessionId: workerNativeSessionIdSchema.nullable(),
        turnId: idSchema,
        type: z.literal('worker-turn-ended'),
    })
    .strict();
export type WorkerTurnEndedFrame = z.infer<typeof workerTurnEndedFrameSchema>;

/** Computer to Server, on every connect: the Workers whose checkout or drive folder it still holds. */
export const workerHeldFrameSchema = z
    .object({
        type: z.literal('worker-held'),
        workerIds: z.array(idSchema).max(1000),
    })
    .strict();
export type WorkerHeldFrame = z.infer<typeof workerHeldFrameSchema>;

/**
 * Server to Computer (Closing step 5): remove this closed Worker's worktree
 * and drive folder. Idempotent; resent for each closed Worker in `worker-held`.
 */
export const workerCloseCommandSchema = z
    .object({ type: z.literal('worker-close'), workerId: idSchema })
    .strict();
export type WorkerCloseCommand = z.infer<typeof workerCloseCommandSchema>;
