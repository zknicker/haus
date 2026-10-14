import { cloudAgentInputRequestSchema, cloudAgentRunSchema, cloudAgentWorkSchema } from '@haus/api';
import * as z from 'zod';
import type { CloudAgentProviderObservation, CloudAgentRunRef } from '../provider.ts';
import type { ClaudeCloudComputer } from './bootstrap.ts';

const snapshotSchema = z.object({
    work: cloudAgentWorkSchema,
    run: cloudAgentRunSchema,
    cancellation: z.object({ runIds: z.array(z.string()), activeRunId: z.string().nullable() }),
    requests: z.array(cloudAgentInputRequestSchema),
    prompts: z.array(
        z.object({ promptId: z.string(), sessionId: z.uuid(), requestId: z.string().nullable() })
    ),
    stopEvidence: z
        .object({
            promptId: z.string(),
            backgroundTasks: z.number().int().nonnegative(),
            sessionCrons: z.number().int().nonnegative().nullable(),
            observedAt: z.iso.datetime(),
        })
        .nullable(),
    continuations: z.array(
        z.object({
            requestId: z.string(),
            state: z.enum(['queued', 'sending', 'accepted']),
            attemptedAt: z.string().nullable(),
        })
    ),
});

export function claudeSnapshotObservation(
    snapshot: z.infer<typeof snapshotSchema>
): CloudAgentProviderObservation {
    const run = snapshot.run;
    return {
        observedAt: snapshot.work.updatedAt,
        status: run.status,
        providerRunId: run.providerRunId ?? undefined,
        providerAgentId: snapshot.work.providerAgentId ?? undefined,
        providerUrl: snapshot.work.providerUrl ?? undefined,
        summary: run.summary ?? undefined,
        errorCode: run.errorCode ?? undefined,
        activity: snapshot.work.activity ?? undefined,
        branches: run.branches,
    };
}
export async function readClaudeCloudSnapshot(
    computer: ClaudeCloudComputer,
    ref: CloudAgentRunRef,
    signal?: AbortSignal
) {
    const response = await fetch(new URL('/computer/cloud-agents/read', computer.serverOrigin), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            credentialHash: computer.credentialHash,
            workId: ref.workId,
            runId: ref.runId,
        }),
        signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
            : AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        throw new Error("Could not read this Computer's Claude Cloud callback evidence.");
    }
    return snapshotSchema.parse(await response.json());
}
