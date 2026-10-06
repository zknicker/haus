import type { Agent, AgentTurnFailureCode, AgentWakePause } from '@haus/api';
import { computerRuntimeCatalog } from '@haus/api';

type FailureKind = AgentWakePause['lastFailure']['kind'];

/**
 * Plain-language copy for an Agent the Server paused after repeated failed
 * turns. Raw error text never reaches the App, so the last error is named
 * from its stable code, falling back to the failure kind.
 */
export function agentWakePauseCopy(
    agent: Pick<Agent, 'desiredRuntimeId' | 'displayName' | 'effectiveRuntimeId'> & {
        wakePause: AgentWakePause;
    },
    { canRestart, now = Date.now() }: { canRestart: boolean; now?: number }
) {
    const { wakePause } = agent;
    const lastError = wakePauseLastError(agent, wakePause);
    return {
        description: [
            `${agent.displayName} failed ${failureCountPhrase(wakePause.failureCount)} in a row: ${lowerFirst(lastError)}`,
            // While the automatic retry runs, offering to retry would race it.
            wakePause.nextProbeAt === null
                ? null
                : `${canRestart ? 'Send a message or restart' : 'Send a message'} to try again now.`,
            wakePauseRetryPhrase(wakePause.nextProbeAt, now),
        ]
            .filter(Boolean)
            .join(' '),
        lastError,
        title: 'Paused after repeated failures',
    };
}

/** The last failure as one plain sentence, naming the Agent's runtime where it matters. */
export function wakePauseLastError(
    agent: Pick<Agent, 'desiredRuntimeId' | 'effectiveRuntimeId'>,
    wakePause: AgentWakePause
): string {
    return wakePauseFailureSentence(
        wakePause.lastFailure,
        runtimeLabel(agent.effectiveRuntimeId ?? agent.desiredRuntimeId)
    );
}

export function wakePauseFailureSentence(
    failure: { code: AgentTurnFailureCode | null; kind: FailureKind },
    runtime = 'the runtime'
): string {
    return failure.code
        ? codeSentences[failure.code](runtime)
        : kindSentences[failure.kind](runtime);
}

/** When the Server will retry on its own; a null time means the retry is running. */
export function wakePauseRetryPhrase(nextProbeAt: string | null, now = Date.now()): string {
    if (nextProbeAt === null) {
        return 'Haus is trying again now…';
    }
    return `Haus will try once more automatically ${relativeFuture(nextProbeAt, now) ?? 'any moment now'}.`;
}

/** The hover banner's short line; the profile carries the full explanation. */
export function wakePauseBannerDescription(nextProbeAt: string | null, now = Date.now()): string {
    // While the automatic retry runs, offering to retry would race it.
    if (nextProbeAt === null) {
        return 'Retrying now…';
    }
    return `Retrying ${relativeFuture(nextProbeAt, now) ?? 'soon'}. Send a message to retry now.`;
}

export function failureCountPhrase(count: number): string {
    if (count === 1) {
        return 'once';
    }
    return count === 2 ? 'twice' : `${count} times`;
}

const codeSentences: Record<AgentTurnFailureCode, (runtime: string) => string> = {
    'authentication-required': (runtime) => `Couldn't sign in to ${runtime}.`,
    'compaction-failed': () => 'The conversation got too long to compact.',
    'configuration-invalid': () => "The Agent's runtime settings aren't valid.",
    'context-too-large': () => 'The conversation got too long for the model.',
    'launch-failed': () => "The Agent couldn't launch.",
    'model-unavailable': () => "The model isn't available on this runtime.",
    'provider-error': () => 'The provider kept erroring.',
    'provider-unavailable': () => 'The provider was unreachable.',
    'rate-limited': () => 'The provider kept hitting its rate limit.',
    'runner-credential-failed': () => "The Computer couldn't hand the Agent its credentials.",
    'runtime-not-installed': () => "The runtime isn't installed on this Computer.",
    'session-resume-rejected': () => "The Agent's session couldn't be resumed.",
    'start-rejected': () => 'The runtime refused to start the run.',
    'turn-stalled': () => 'The run stalled.',
};

const kindSentences: Record<FailureKind, (runtime: string) => string> = {
    authentication: (runtime) => `Couldn't sign in to ${runtime}.`,
    configuration: () => "The Agent's runtime settings aren't valid.",
    input: () => "The runtime couldn't accept the Agent's input.",
    'rate-limit': () => 'The provider kept hitting its rate limit.',
    'session-resume': () => "The Agent's session couldn't be resumed.",
    timeout: () => 'The run stalled.',
    transport: () => 'The provider was unreachable.',
    unknown: () => 'Something went wrong running the Agent.',
};

function runtimeLabel(runtimeId: string): string {
    return computerRuntimeCatalog.find(({ id }) => id === runtimeId)?.label ?? 'the runtime';
}

/** A future time as "in N units"; null once it is due or unparseable. */
function relativeFuture(value: string, now: number): string | null {
    const minutes = Math.round((new Date(value).getTime() - now) / 60_000);
    if (Number.isNaN(minutes) || minutes < 1) {
        return null;
    }
    if (minutes < 60) {
        return minutes === 1 ? 'in a minute' : `in ${minutes} minutes`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return hours === 1 ? 'in an hour' : `in ${hours} hours`;
    }
    const days = Math.round(hours / 24);
    return days === 1 ? 'in a day' : `in ${days} days`;
}

function lowerFirst(sentence: string): string {
    return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}
