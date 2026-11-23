import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { workerTurnAttemptSchema } from './worker-computer-frames.ts';
import { workerTimestampSchema } from './worker-time.ts';

const tokenSchema = z.string().min(32).max(512);

const credentialHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const mintedShape = {
    expiresAt: workerTimestampSchema,
    state: z.literal('minted'),
    token: tokenSchema,
};

/**
 * `POST /computer/workers/turn-credential`, with the Computer's attachment
 * credential, after it journaled the turn. The minted token becomes the
 * Worker's `HAUS_WORKER_TOKEN`. It reaches `POST /api/worker/report` and the
 * Drive reads (`/api/agent/drive/changes`, `/api/agent/artifacts/by-path`,
 * `/api/agent/artifacts/:id/download`) as a Bearer token, and nothing else.
 * Asking again for the same attempt revokes the earlier token and mints a new one.
 */
export const workerTurnCredentialRequestSchema = z
    .object({
        attempt: workerTurnAttemptSchema,
        credentialHash: credentialHashSchema,
        turnId: idSchema,
    })
    .strict();
export type WorkerTurnCredentialRequest = z.infer<typeof workerTurnCredentialRequestSchema>;

/** Why the launch fence refused: the Computer reports the turn ended `refused` and never launches. */
export const workerTurnCredentialRefusals = [
    'settled',
    'stop-requested',
    'stale-attempt',
    'earlier-turn-stopping',
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
 * the turn's drive folder under `push_id` = the turn id, through
 * `/api/agent/drive/push/{put,delete,close}` as a Bearer token. It also reads
 * Drive like the turn token, so the push can fetch merged revisions. It never
 * enters the harness. Asking again revokes the earlier push token.
 */
export const workerPushCredentialRequestSchema = z
    .object({ credentialHash: credentialHashSchema, turnId: idSchema })
    .strict();
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
