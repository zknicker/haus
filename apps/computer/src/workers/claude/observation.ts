import { workerActivityMaxLength, workerSummaryMaxLength } from '@haus/api';
import type { CloudAgentProviderObservation } from '../provider.ts';
import { observedResultOf } from '../report-from-result.ts';
import { boundedReport, boundedSummary } from '../report-text.ts';
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
import { claudeSteps } from './steps.ts';

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

export function claudeRunObservation(input: {
    cancelRequestId: string;
    events: ClaudeSessionEvent[];
    observedAt: string;
    ref: { providerRunId?: string | null; turnId: string; workerId: string };
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
                  observedAt,
                  stallCode: 'claude-prompt-not-found',
                  status: 'running',
                  summary: 'Claude’s session log is too large to find this Run’s own prompt in it.',
              }
            : activity(
                  observedAt,
                  { observedAt, status: 'queued' },
                  'Waiting for Claude to take the prompt.'
              );
    }
    // Haus sends the next prompt only after this turn settled, so everything past it is a later turn's.
    const rest = prompt ? chronological.slice(start + 1) : chronological;
    const nextPromptOffset = rest.findIndex(isHausPrompt);
    const after = nextPromptOffset === -1 ? rest : rest.slice(0, nextPromptOffset);
    // Claude took the prompt when it logged it; the reading's own time is only when Haus looked.
    const startedAt = input.events.find((event) => isRunPrompt(event, tag))?.createdAt;
    const base: Base = {
        ...evidence(after),
        ...claudeSteps(after),
        observedAt,
        providerRunId: prompt?.id ?? (anchoredRunId as string),
        rawStatus: session.workerStatus,
        ...(startedAt ? { startedAt: new Date(startedAt).toISOString() } : {}),
    };
    const observation = afterPrompt(base, after, input);
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
              stallCode: 'claude-prompt-not-found',
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
        const question = questionOf(after, session.pendingAction);
        return {
            ...base,
            result: observedResultOf(question, base.branches),
            status: 'pending_input',
            summary: bounded(question, workerSummaryMaxLength),
        };
    }
    const tasks = openTasks(after);
    // First, not last: this Run's own prompted turn always produces this
    // window's first result. A self-started or adopted turn (a background
    // task finishing, idle compaction) only ever runs while idle, so its own
    // trivial result can only land after this one, never answer it.
    const result = after.find((entry): entry is Entry<'result'> => entry.kind === 'result');
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
    const final = result.text ? observedResultOf(result.text, base.branches) : null;
    if (!result.isError) {
        const report = result.text ? boundedReport(result.text) : null;
        return {
            ...base,
            result: final,
            status: 'completed',
            ...(report ? { report, summary: boundedSummary(report) } : {}),
        };
    }
    const report = boundedReport(result.text ?? `Claude stopped: ${result.subtype}.`);
    return {
        ...base,
        errorCode: `claude-${result.subtype}`.slice(0, 120),
        report,
        result: final,
        status: 'failed',
        summary: boundedSummary(report),
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
        activity: { at, summary: bounded(summary, workerActivityMaxLength) },
    };
}

function bounded(text: string, limit: number): string {
    const trimmed = text.trim();
    return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}
