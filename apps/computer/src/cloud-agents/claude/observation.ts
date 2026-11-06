import { cloudAgentActivityMaxLength, cloudAgentSummaryMaxLength } from '@haus/api';
import type { CloudAgentProviderObservation } from '../provider.ts';
import type { ClaudeSession, ClaudeSessionEvent } from './controller.ts';
import { evidence } from './evidence.ts';
import { questionOf } from './pending-question.ts';
import {
    type ClaudeLogEntry,
    claudeRunTag,
    isHausPrompt,
    isRunPrompt,
    lastOf,
    logEntriesOf,
} from './session-events.ts';

type Entry<Kind extends ClaudeLogEntry['kind']> = Extract<ClaudeLogEntry, { kind: Kind }>;

/**
 * One Run's state, read from the hosted session itself: its worker status and
 * the session log after the prompt Haus sent. No hook or callback runs inside
 * Claude's environment.
 *
 * - The worker running, or idle with background tasks still going, is
 *   `running`.
 * - The worker blocked on the person (`requires_action`) is `pending_input`:
 *   the Run settles with the question as its summary, and the delegating
 *   Agent answers with a follow-up.
 * - The worker idle after a turn result is `completed`, or `failed` when the
 *   last result is an error.
 * - Haus's own interrupt, acknowledged and no longer running, is `cancelled`.
 * - An archived session that never finished the Run is `expired`.
 */
/** A non-terminal Run reporting this never settles it, but still wakes the delegating Agent. */
export const claudePromptNotFoundErrorCode = 'claude-prompt-not-found';

export function claudeRunObservation(input: {
    cancelRequestId: string;
    events: ClaudeSessionEvent[];
    observedAt: string;
    ref: { providerRunId?: string | null; runId: string; workId: string };
    session: ClaudeSession;
    /** The backward scan for this Run's own prompt gave up before reaching it or the log's end. */
    truncated?: boolean;
}): CloudAgentProviderObservation {
    const { observedAt, session } = input;
    const tag = claudeRunTag(input.ref);
    const chronological = [...input.events].reverse().flatMap(logEntriesOf);
    const start = chronological.findIndex(
        (entry) =>
            entry.kind === 'prompt' &&
            entry.text.split(/\r?\n/u).some((line) => line.trim() === tag)
    );
    const prompt = chronological[start] as Entry<'prompt'> | undefined;
    // A Run already found once needs no second discovery: a restart loses the
    // reading's window, not the fact, and every event read is at or after that prompt.
    const anchoredRunId = prompt ? null : (input.ref.providerRunId ?? null);
    if (!(prompt || anchoredRunId)) {
        if (session.status === 'archived') {
            return {
                observedAt,
                status: 'expired',
                summary: 'The Claude session was archived before it took this prompt.',
            };
        }
        // A session with enough activity can hide this Run's own prompt past
        // the scan's reach. Reading `queued` forever with no sign of that
        // would leave the Run silently unaddressed even once it has long
        // finished, so this reads as still in progress with a visible cause
        // instead (TECH-7).
        return input.truncated
            ? {
                  errorCode: claudePromptNotFoundErrorCode,
                  observedAt,
                  status: 'running',
                  summary: 'Claude’s session log is too large to find this Run’s own prompt in it.',
              }
            : activity(
                  observedAt,
                  { observedAt, status: 'queued' },
                  'Waiting for Claude to take the prompt.'
              );
    }
    // Bounded at the next Haus prompt: Haus may already have sent a follow-up
    // into this same session before this Run's own turn finished, so reading
    // past that point would attribute a later Run's activity and result to
    // this one.
    const rest = prompt ? chronological.slice(start + 1) : chronological;
    const nextPromptOffset = rest.findIndex(isHausPrompt);
    const after = nextPromptOffset === -1 ? rest : rest.slice(0, nextPromptOffset);
    // Claude took the prompt when it logged it; the reading's own time is only when Haus looked.
    const startedAt = input.events.find((event) => isRunPrompt(event, tag))?.createdAt;
    const base: Base = {
        ...evidence(after),
        observedAt,
        providerRunId: prompt?.id ?? (anchoredRunId as string),
        rawStatus: session.workerStatus,
        ...(startedAt ? { startedAt: new Date(startedAt).toISOString() } : {}),
    };
    const observation = afterPrompt(base, after, input);
    const shared =
        observation.status === 'running' && nextPromptOffset !== -1
            ? sharedTurnResult(rest, nextPromptOffset)
            : null;
    if (shared) {
        return sharedResultObservation(base, shared);
    }
    return anchoredRunId ? surfaceLostResult(observation, after, session) : observation;
}

/** An idle session whose result lies past the window read can't settle; say so, don't go quiet. */
function surfaceLostResult(
    observation: CloudAgentProviderObservation,
    after: ClaudeLogEntry[],
    session: ClaudeSession
): CloudAgentProviderObservation {
    return observation.status === 'running' &&
        session.workerStatus !== 'running' &&
        openTasks(after) === 0
        ? {
              ...observation,
              errorCode: claudePromptNotFoundErrorCode,
              summary: 'Claude’s session log is too large to find this Run’s result in it.',
          }
        : observation;
}

type Base = Omit<CloudAgentProviderObservation, 'status'>;

function afterPrompt(
    base: Base,
    after: ClaudeLogEntry[],
    input: { cancelRequestId: string; observedAt: string; session: ClaudeSession }
): CloudAgentProviderObservation {
    const { session } = input;
    const running = session.workerStatus === 'running';
    if (!running && answered(after, input.cancelRequestId)) {
        return { ...base, status: 'cancelled', summary: 'Stopped from Haus.' };
    }
    if (session.workerStatus === 'requires_action') {
        return {
            ...base,
            status: 'pending_input',
            summary: bounded(questionOf(after, session.pendingAction), cloudAgentSummaryMaxLength),
        };
    }
    const tasks = openTasks(after);
    const result = lastOf(after, (entry): entry is Entry<'result'> => entry.kind === 'result');
    if (!running && tasks === 0 && result) {
        return resultObservation(base, result);
    }
    if (session.status === 'archived') {
        return {
            ...base,
            status: 'expired',
            summary: 'The Claude session was archived before this work finished.',
        };
    }
    const latest =
        !running && tasks > 0
            ? `Waiting on ${tasks} background task${tasks === 1 ? '' : 's'}.`
            : latestActivity(after);
    return latest
        ? activity(session.lastEventAt ?? input.observedAt, { ...base, status: 'running' }, latest)
        : { ...base, status: 'running' };
}

function answered(entries: ClaudeLogEntry[], requestId: string): boolean {
    return entries.some(
        (entry) =>
            entry.kind === 'control-response' && entry.success && entry.requestId === requestId
    );
}

function resultObservation(base: Base, result: Entry<'result'>): CloudAgentProviderObservation {
    if (!result.isError) {
        return {
            ...base,
            status: 'completed',
            ...(result.text ? { summary: bounded(result.text, cloudAgentSummaryMaxLength) } : {}),
        };
    }
    return {
        ...base,
        errorCode: `claude-${result.subtype}`.slice(0, 120),
        status: 'failed',
        summary: bounded(
            result.text ?? `Claude stopped: ${result.subtype}.`,
            cloudAgentSummaryMaxLength
        ),
    };
}

/**
 * A follow-up injected mid-turn can merge into one continuous turn whose
 * result logs after that follow-up's own prompt, not before it. This Run's
 * own window carried no result, so look past the next Haus prompt for the
 * turn's eventual, shared one rather than leaving this Run reading `running`
 * forever (TECH-7, round 5).
 */
function sharedTurnResult(
    rest: ClaudeLogEntry[],
    nextPromptOffset: number
): { followUpRunId: string; result: Entry<'result'> } | null {
    const result = rest
        .slice(nextPromptOffset)
        .find((entry): entry is Entry<'result'> => entry.kind === 'result');
    if (!result) {
        return null;
    }
    const followUpPrompt = rest[nextPromptOffset] as Entry<'prompt'>;
    return { followUpRunId: runIdOf(followUpPrompt.text), result };
}

function runIdOf(text: string): string {
    const tag = text.split(/\r?\n/u).find((line) => line.trim().startsWith('HAUS_CLOUD_RUN='));
    return tag?.trim().split('/').at(-1) ?? 'a later follow-up';
}

function sharedResultObservation(
    base: Base,
    shared: { followUpRunId: string; result: Entry<'result'> }
): CloudAgentProviderObservation {
    const settled = resultObservation(base, shared.result);
    const note = `Continued in follow-up ${shared.followUpRunId}, which finished it.`;
    return {
        ...settled,
        summary: bounded(
            settled.summary ? `${note} ${settled.summary}` : note,
            cloudAgentSummaryMaxLength
        ),
    };
}

function openTasks(entries: ClaudeLogEntry[]): number {
    const tasks = new Map<string, boolean>();
    for (const entry of entries) {
        if (entry.kind === 'task') {
            tasks.set(entry.id, entry.terminal || tasks.get(entry.id) === true);
        }
    }
    return [...tasks.values()].filter((terminal) => !terminal).length;
}

function latestActivity(entries: ClaudeLogEntry[]): string | null {
    const latest = lastOf(
        entries,
        (entry) => entry.kind === 'assistant-text' || entry.kind === 'tool-use'
    );
    if (latest?.kind === 'assistant-text') {
        return latest.text.trim().split(/\r?\n/u)[0] ?? null;
    }
    return latest?.kind === 'tool-use' ? `Using ${latest.name}` : null;
}

function activity(
    at: string,
    observation: CloudAgentProviderObservation,
    summary: string
): CloudAgentProviderObservation {
    return {
        ...observation,
        activity: { at, summary: bounded(summary, cloudAgentActivityMaxLength) },
    };
}

function bounded(text: string, limit: number): string {
    const trimmed = text.trim();
    return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}
