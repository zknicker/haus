import * as z from 'zod';
import { idSchema } from './chat.ts';

/**
 * A Computer mints a per-launch runner credential from its Computer credential
 * before spawning the Agent. The credential is scoped to exactly one Agent,
 * run, and Server. The launch chat (null for a chatless run) is context only; Agent
 * API routes still resolve each target and membership Server-side.
 */
export const runnerMintRequestSchema = z
    .object({
        agentId: idSchema,
        chatId: idSchema.nullable(),
        credentialHash: z.string().regex(/^[a-f0-9]{64}$/u),
        /** A drive-sync credential reaches only the Drive sync routes and lives 15 minutes. */
        purpose: z.enum(['run', 'drive-sync']).default('run'),
        runId: idSchema,
    })
    .strict();

export const driveSyncRunnerCapability = 'drive-sync' as const;

export type RunnerMintRequest = z.infer<typeof runnerMintRequestSchema>;

export const runnerTokenSchema = z.string().regex(/^grtr_[A-Za-z0-9_-]{43}$/u);

export const runnerMintResponseSchema = z
    .object({ runnerId: idSchema, runnerToken: runnerTokenSchema })
    .strict();

export type RunnerMintResponse = z.infer<typeof runnerMintResponseSchema>;

export const runnerRevokeRequestSchema = z
    .object({
        credentialHash: z.string().regex(/^[a-f0-9]{64}$/u),
        runnerId: idSchema,
    })
    .strict();

export type RunnerRevokeRequest = z.infer<typeof runnerRevokeRequestSchema>;
