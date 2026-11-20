import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { workerTurnAttemptSchema } from './worker-computer-frames.ts';
import { workerTimestampSchema } from './worker-time.ts';

const tokenSchema = z.string().min(32).max(512);

const mintedShape = {
    expiresAt: workerTimestampSchema,
    state: z.literal('minted'),
    token: tokenSchema,
};

/**
 * `POST /computer/workers/turn-credential`, with the Computer's attachment
 * credential, after it journaled the turn. The minted token becomes the
 * Worker's `HAUS_WORKER_TOKEN`. Asking again for the same attempt is safe.
 */
export const workerTurnCredentialRequestSchema = z
    .object({ attempt: workerTurnAttemptSchema, turnId: idSchema })
    .strict();
export type WorkerTurnCredentialRequest = z.infer<typeof workerTurnCredentialRequestSchema>;

/** Why the launch fence refused: the Computer reports the turn ended `refused` and never launches. */
export const workerTurnCredentialRefusals = [
    'settled',
    'stop-requested',
    'stale-attempt',
    'closing',
    'place-off',
    'not-dispatched-here',
] as const;
export const workerTurnCredentialRefusalSchema = z.enum(workerTurnCredentialRefusals);

export const workerTurnCredentialResponseSchema = z.discriminatedUnion('state', [
    z.object({ ...mintedShape, attempt: workerTurnAttemptSchema, turnId: idSchema }).strict(),
    z
        .object({
            reason: workerTurnCredentialRefusalSchema,
            state: z.literal('refused'),
            turnId: idSchema,
        })
        .strict(),
]);
export type WorkerTurnCredentialResponse = z.infer<typeof workerTurnCredentialResponseSchema>;

/**
 * `POST /computer/workers/push-credential`: the daemon's own authority to push
 * the turn's drive folder under the turn id. It never enters the harness.
 */
export const workerPushCredentialRequestSchema = z.object({ turnId: idSchema }).strict();
export type WorkerPushCredentialRequest = z.infer<typeof workerPushCredentialRequestSchema>;

export const workerPushCredentialResponseSchema = z.discriminatedUnion('state', [
    z.object({ ...mintedShape, turnId: idSchema }).strict(),
    z
        .object({
            reason: z.literal('not-dispatched-here'),
            state: z.literal('refused'),
            turnId: idSchema,
        })
        .strict(),
]);
export type WorkerPushCredentialResponse = z.infer<typeof workerPushCredentialResponseSchema>;
