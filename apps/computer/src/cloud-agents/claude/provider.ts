import { isTerminalCloudAgentStatus } from '@haus/api';
import { resolveRuntimeExecutable } from '../../runtime-discovery.ts';
import {
    type CloudAgentLaunch,
    CloudAgentLaunchRejectedError,
    type CloudAgentProvider,
    type CloudAgentProviderObservation,
    CloudAgentProviderUnavailableError,
    type CloudAgentReadiness,
    type CloudAgentRunRef,
    cloudAgentUnreadyMessage,
} from '../provider.ts';
import { readClaudeEnvironmentId } from '../settings.ts';
import { withClaudeCheckout } from './checkout.ts';
import { type ClaudeController, createClaudeController } from './controller.ts';
import {
    ClaudeCloudEnvironmentUnavailableError,
    cloudAgentEnvironmentsOf,
    listClaudeCloudEnvironments,
    requireLiveClaudeCloudEnvironment,
} from './environments.ts';
import { readClaudeNativeAccount } from './native-auth.ts';
import { launchNativeClaudeCloud, sendNativeClaudeCloud } from './native-commands.ts';
import { claudeRunObservation } from './observation.ts';
import { claudeRunTag, isRunPrompt, logEntriesOf } from './session-events.ts';

/** Claude's own model aliases; each follows Claude's newest model of that tier. */
const claudeModels = [
    { description: 'Balanced speed and capability.', displayName: 'Claude Sonnet', id: 'sonnet' },
    { description: 'Claude’s most capable model.', displayName: 'Claude Opus', id: 'opus' },
    { description: 'The fastest Claude model.', displayName: 'Claude Haiku', id: 'haiku' },
];
const pollInterval = 10_000;
const answerSettleTimeout = 30_000;

/**
 * Claude Code's cloud sessions, behind `CloudAgentProvider`. Launches and
 * follow-ups go through this Computer's own `claude` CLI; readings come from
 * the hosted session's state and event log. Nothing Haus-specific runs inside
 * Claude's environment: a question surfaces because the session itself stops
 * on `requires_action`, and the delegating Agent answers with a follow-up.
 */
export function createClaudeCloudAgentProvider(
    dataRoot: string,
    controller: ClaudeController = createClaudeController()
): CloudAgentProvider {
    const read = async (
        ref: CloudAgentRunRef,
        signal?: AbortSignal
    ): Promise<CloudAgentProviderObservation> => {
        const sessionId = requireSession(ref);
        const tag = claudeRunTag(ref);
        const [session, events] = await Promise.all([
            controller.session(sessionId, signal),
            controller.events(sessionId, (event) => isRunPrompt(event, tag), signal),
        ]);
        return claudeRunObservation({
            cancelRequestId: cancelRequestId(ref),
            events,
            observedAt: new Date().toISOString(),
            ref,
            session,
        });
    };
    const readiness = async (): Promise<CloudAgentReadiness> => {
        if (!resolveRuntimeExecutable('claude')) {
            return { ready: false, reason: 'provider-unavailable' };
        }
        const account = await readClaudeNativeAccount();
        return account.signedIn
            ? { account: { email: account.email, expiresAt: null }, ready: true }
            : { ready: false, reason: 'not-connected' };
    };
    return {
        async cancel(ref, signal) {
            const sessionId = requireSession(ref);
            const tag = claudeRunTag(ref);
            const entries = (
                await controller.events(sessionId, (event) => isRunPrompt(event, tag), signal)
            ).flatMap(logEntriesOf);
            const requestId = cancelRequestId(ref);
            if (
                entries.some(
                    (entry) => entry.kind === 'control-response' && entry.requestId === requestId
                )
            ) {
                return;
            }
            // An interrupt halts the foreground turn; each background task needs its own stop.
            for (const taskId of openTaskIds(entries)) {
                await controller.stopTask(
                    sessionId,
                    { requestId: `haus-stop-${ref.runId}-${taskId}`, taskId },
                    signal
                );
            }
            await controller.interrupt(sessionId, requestId, signal);
        },
        // Claude Cloud uses the Computer's own Claude Code sign-in; Haus starts none of its own.
        connect: readiness,
        disconnect: readiness,
        listEnvironments: () => listClaudeCloudEnvironments().then(cloudAgentEnvironmentsOf),
        listModels: () => Promise.resolve(claudeModels),
        provider: 'claude',
        read,
        readiness,
        async send(input): Promise<CloudAgentLaunch> {
            const sessionId = input.providerAgentId;
            const tag = claudeRunTag({ runId: input.idempotencyKey, workId: input.workId });
            const delivered = (
                await controller.events(sessionId, (event) => isRunPrompt(event, tag))
            ).find((event) => isRunPrompt(event, tag));
            if (!delivered) {
                await settleQuestion(controller, sessionId, input.idempotencyKey);
                await sendNativeClaudeCloud({
                    modelId: input.model?.id ?? null,
                    prompt: `${tag}\n\n${input.instructions}`,
                    sessionId,
                });
            }
            return {
                // A follow-up targets a session Claude already placed; it resolves no environment anew.
                environmentId: null,
                environmentName: null,
                providerAgentId: sessionId,
                providerRunId: null,
                providerUrl: sessionUrl(sessionId),
                status: 'queued',
            };
        },
        async start(input, signal): Promise<CloudAgentLaunch> {
            await requireReady(readiness);
            const environment = await resolveClaudeEnvironment(dataRoot, signal);
            const prompt = `${claudeRunTag({ runId: input.idempotencyKey, workId: input.workId })}\n\n${input.instructions}`;
            const receipt = await withClaudeCheckout({ ...input, signal }, (cwd) =>
                launchNativeClaudeCloud({
                    cwd,
                    environmentId: environment?.id ?? null,
                    modelId: input.model?.id ?? null,
                    prompt,
                    signal,
                })
            );
            return {
                environmentId: environment?.id ?? null,
                environmentName: environment?.name ?? null,
                providerAgentId: receipt.sessionId,
                providerRunId: null,
                providerUrl: receipt.url,
                status: 'queued',
            };
        },
        async subscribe(ref, onObservation, signal) {
            // Claude's session stream is not part of this adapter; a bounded poll is the live edge.
            while (!signal.aborted) {
                await Bun.sleep(pollInterval);
                if (signal.aborted) {
                    return;
                }
                const observation = await read(ref, signal);
                onObservation(observation);
                if (isTerminalCloudAgentStatus(observation.status)) {
                    return;
                }
            }
        },
    };
}

/**
 * A session waiting on a question takes no new prompt as an answer until the
 * question is withdrawn, so the follow-up first interrupts it and waits for
 * the worker to come to rest.
 */
async function settleQuestion(
    controller: ClaudeController,
    sessionId: string,
    runId: string
): Promise<void> {
    const session = await controller.session(sessionId);
    if (session.workerStatus !== 'requires_action') {
        return;
    }
    await controller.interrupt(sessionId, `haus-answer-${runId}`);
    const deadline = Date.now() + answerSettleTimeout;
    while (Date.now() < deadline) {
        await Bun.sleep(1000);
        if ((await controller.session(sessionId)).workerStatus === 'idle') {
            return;
        }
    }
    throw new Error('Claude did not set its question aside in time; the answer will retry.');
}

function openTaskIds(entries: ReturnType<typeof logEntriesOf>): string[] {
    const tasks = new Map<string, boolean>();
    for (const entry of [...entries].reverse()) {
        if (entry.kind === 'task') {
            tasks.set(entry.id, entry.terminal || tasks.get(entry.id) === true);
        }
    }
    return [...tasks].flatMap(([id, terminal]) => (terminal ? [] : [id]));
}

/**
 * The environment this launch pins to, checked fresh on every launch so a
 * Computer never falls back to Claude Code's own default silently. `null`
 * means this Computer pins nothing, so `--cloud` picks its own environment as
 * it always has.
 */
export async function resolveClaudeEnvironment(
    dataRoot: string,
    signal?: AbortSignal
): Promise<{ id: string; name: string } | null> {
    const environmentId = await readClaudeEnvironmentId(dataRoot);
    if (!environmentId) {
        return null;
    }
    try {
        const match = await requireLiveClaudeCloudEnvironment(environmentId, signal);
        return { id: match.id, name: match.name };
    } catch (error) {
        if (error instanceof ClaudeCloudEnvironmentUnavailableError) {
            throw new CloudAgentLaunchRejectedError(error.message);
        }
        throw error;
    }
}

async function requireReady(readiness: () => Promise<CloudAgentReadiness>): Promise<void> {
    const state = await readiness();
    if (!state.ready) {
        // Nothing reached Claude, so the launch is definitely refused rather than unconfirmed.
        throw new CloudAgentLaunchRejectedError(cloudAgentUnreadyMessage(state.reason));
    }
}

function requireSession(ref: CloudAgentRunRef): string {
    if (!ref.providerAgentId) {
        throw new CloudAgentProviderUnavailableError('not-connected');
    }
    return ref.providerAgentId;
}

/** One deterministic id per Run, so a reading can tell Haus's own interrupt from any other. */
function cancelRequestId(ref: { runId: string }): string {
    return `haus-cancel-${ref.runId}`;
}

function sessionUrl(sessionId: string): string {
    return `https://claude.ai/code/${sessionId}`;
}
