import * as z from 'zod';
import { resolveRuntimeExecutable } from '../../runtime-discovery.ts';
import {
    type CloudAgentProvider,
    CloudAgentProviderUnavailableError,
    type CloudAgentReadiness,
} from '../provider.ts';
import { readCloudAgentSettings } from '../settings.ts';
import type { ClaudeCloudComputer } from './bootstrap.ts';
import { isNativeClaudeCloudOrigin, revokeClaudeCloudBootstrap } from './bootstrap.ts';
import { prepareClaudeCloudCheckout } from './checkout.ts';
import { confirmedClaudeInterrupt, interruptClaudeCloud } from './interrupt.ts';
import { launchNativeClaudeCloud, sendNativeClaudeCloud } from './native-commands.ts';
import { claudeSnapshotObservation, readClaudeCloudSnapshot } from './snapshot.ts';

const authSchema = z.object({
    loggedIn: z.boolean(),
    authMethod: z.string().optional(),
    email: z.string().nullable().optional(),
});

/** Native login is necessary; secure hosted hooks and lifecycle controls are also required. */
export function createClaudeCloudAgentProvider(computer?: ClaudeCloudComputer): CloudAgentProvider {
    const readiness = async (): Promise<CloudAgentReadiness> => {
        const executable = resolveRuntimeExecutable('claude');
        if (!executable) {
            return { ready: false, reason: 'provider-unavailable' };
        }
        const child = Bun.spawn([executable.path, 'auth', 'status', '--json'], {
            env: { ...process.env, PATH: executable.searchPath },
            stdout: 'pipe',
            stderr: 'ignore',
            timeout: 5000,
        });
        const output = await new Response(child.stdout).text();
        if ((await child.exited) !== 0) {
            return { ready: false, reason: 'not-connected' };
        }
        const auth = authSchema.parse(JSON.parse(output));
        if (!(auth.loggedIn && auth.authMethod === 'claude.ai')) {
            return { ready: false, reason: 'not-connected' };
        }
        if (
            !(computer && isNativeClaudeCloudOrigin(computer.serverOrigin)) ||
            (await readCloudAgentSettings(computer.dataRoot)).claudeEnvironmentId !== null
        ) {
            return { ready: false, reason: 'setup-required' };
        }
        const response = await fetch(
            new URL('/computer/cloud-agents/bootstrap-status', computer.serverOrigin),
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ credentialHash: computer.credentialHash }),
                signal: AbortSignal.timeout(30_000),
            }
        );
        if (!response.ok) {
            return { ready: false, reason: 'provider-unavailable' };
        }
        const status = z
            .object({
                verified: z.boolean(),
                configured: z.boolean(),
                protocolVersion: z.number().nullable(),
                remoteVersion: z.string().nullable(),
            })
            .parse(await response.json());
        if (!status.configured) {
            return { ready: false, reason: 'not-connected' };
        }
        if (!status.verified || status.protocolVersion !== 1) {
            return { ready: false, reason: 'setup-required' };
        }
        return { ready: true, account: { email: auth.email ?? null, expiresAt: null } };
    };
    const unavailable = async (): Promise<never> => {
        throw new CloudAgentProviderUnavailableError('setup-required');
    };
    return {
        provider: 'claude',
        readiness,
        // Haus does not own the user's native Claude login; disconnect never logs it out.
        connect: readiness,
        async disconnect() {
            if (computer) {
                await revokeClaudeCloudBootstrap(computer);
            }
            return { ready: false, reason: 'not-connected' };
        },
        listModels: async () => [
            { id: 'sonnet', displayName: 'Claude Sonnet' },
            { id: 'opus', displayName: 'Claude Opus' },
            { id: 'haiku', displayName: 'Claude Haiku' },
        ],
        async start(input) {
            const context = await requireReady();
            if (!input.workId) {
                throw new Error('Claude Cloud launch needs its admitted work identity.');
            }
            const cwd = await prepareClaudeCloudCheckout(context, {
                repository: input.repository,
                ref: input.ref,
                runId: input.idempotencyKey,
            });
            const receipt = await launchNativeClaudeCloud({
                cwd,
                trustOwnedCheckout: true,
                modelId: input.model?.id ?? null,
                instructions: tag(input.workId, input.idempotencyKey) + input.instructions,
            });
            return {
                providerAgentId: receipt.sessionId,
                providerRunId: null,
                providerUrl: receipt.url,
                status: 'queued',
            };
        },
        async send(input) {
            await requireReady();
            if (!input.workId) {
                throw new Error('Claude Cloud follow-up needs its admitted work identity.');
            }
            const receipt = await sendNativeClaudeCloud({
                sessionId: input.providerAgentId,
                modelId: input.model?.id ?? null,
                instructions: tag(input.workId, input.idempotencyKey) + input.instructions,
            });
            return {
                providerAgentId: receipt.sessionId,
                providerRunId: null,
                providerUrl: receipt.url,
                status: 'queued',
            };
        },
        async read(ref, signal) {
            if (!computer) {
                return unavailable();
            }
            const snapshot = await readClaudeCloudSnapshot(computer, ref, signal);
            const interrupted = await confirmedClaudeInterrupt(
                computer,
                ref,
                snapshot.work.cancelRequestedAt
            );
            if (
                interrupted &&
                !(snapshot.stopEvidence?.sessionCrons && snapshot.stopEvidence.sessionCrons > 0)
            ) {
                return {
                    observedAt: interrupted.confirmedAt,
                    status: 'cancelled',
                    rawStatus: 'INTERRUPTED',
                    ...(snapshot.run.providerRunId
                        ? { providerRunId: snapshot.run.providerRunId }
                        : {}),
                    summary: 'Native Claude confirmed interruption of this work.',
                };
            }
            for (const continuation of snapshot.continuations.filter(
                (entry) => entry.state === 'queued' && snapshot.work.cancelRequestedAt === null
            )) {
                await resume(computer, continuation.requestId, signal);
            }
            return claudeSnapshotObservation(snapshot);
        },
        async cancel(ref, signal) {
            if (!computer) {
                return unavailable();
            }
            await interruptClaudeCloud(computer, ref, signal);
        },
        // Durable Server callbacks own observations; the supervisor performs bounded recovery reads.
        subscribe: async () => undefined,
    };

    async function requireReady() {
        const state = await readiness();
        if (!(computer && state.ready)) {
            throw new CloudAgentProviderUnavailableError(
                state.ready ? 'setup-required' : state.reason
            );
        }
        return computer;
    }
}

function tag(workId: string, runId: string) {
    return `HAUS_CLOUD_RUN=${workId}/${runId}\n`;
}

async function resume(computer: ClaudeCloudComputer, requestId: string, signal?: AbortSignal) {
    const response = await fetch(
        new URL('/computer/cloud-agents/continue', computer.serverOrigin),
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ credentialHash: computer.credentialHash, requestId }),
            signal: signal
                ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
                : AbortSignal.timeout(30_000),
        }
    );
    if (!response.ok) {
        throw new Error('The Server could not claim the Claude Cloud continuation.');
    }
    const claim = z
        .discriminatedUnion('claimed', [
            z.object({ claimed: z.literal(false) }),
            z.object({
                claimed: z.literal(true),
                requestId: z.string(),
                workId: z.string(),
                runId: z.string(),
                providerAgentId: z.string(),
            }),
        ])
        .parse(await response.json());
    if (!claim.claimed) {
        return;
    }
    await sendNativeClaudeCloud({
        sessionId: claim.providerAgentId,
        signal,
        instructions: `${tag(claim.workId, claim.runId)}HAUS_CLOUD_INPUT=${claim.requestId}\nReissue the original AskUserQuestion. The Haus hook supplies the stored answer. Continue the original delegated task after consumption.`,
    });
}
