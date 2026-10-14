import {
    type CloudAgentBranch,
    cloudAgentActivityMaxLength,
    cloudAgentSummaryMaxLength,
} from '@haus/api';
import type { CloudAgentProviderObservation } from '../provider.ts';
import type { ClaudeSession, ClaudeSessionEvent } from './controller.ts';
import { type ClaudeLogEntry, claudeRunTag, logEntriesOf } from './session-events.ts';

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
    ref: { runId: string; workId: string };
    session: ClaudeSession;
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
    if (!prompt) {
        return session.status === 'archived'
            ? {
                  observedAt,
                  status: 'expired',
                  summary: 'The Claude session was archived before it took this prompt.',
              }
            : activity(
                  observedAt,
                  { observedAt, status: 'queued' },
                  'Waiting for Claude to take the prompt.'
              );
    }
    const after = chronological.slice(start + 1);
    const base = {
        ...evidence(after),
        observedAt,
        providerRunId: prompt.id,
        rawStatus: session.workerStatus,
    };
    const running = session.workerStatus === 'running';
    if (
        !running &&
        after.some(
            (entry) =>
                entry.kind === 'control-response' &&
                entry.success &&
                entry.requestId === input.cancelRequestId
        )
    ) {
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
        return result.isError
            ? {
                  ...base,
                  errorCode: `claude-${result.subtype}`.slice(0, 120),
                  status: 'failed',
                  summary: bounded(
                      result.text ?? `Claude stopped: ${result.subtype}.`,
                      cloudAgentSummaryMaxLength
                  ),
              }
            : {
                  ...base,
                  status: 'completed',
                  ...(result.text
                      ? { summary: bounded(result.text, cloudAgentSummaryMaxLength) }
                      : {}),
              };
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
        ? activity(session.lastEventAt ?? observedAt, { ...base, status: 'running' }, latest)
        : { ...base, status: 'running' };
}

/** What the worker is waiting on: the open AskUserQuestion, else the tool it wants to use. */
function questionOf(entries: ClaudeLogEntry[], pendingAction: unknown): string {
    const answered = new Set(
        entries.flatMap((entry) => (entry.kind === 'tool-result' ? [entry.toolUseId] : []))
    );
    const open = lastOf(
        entries,
        (entry): entry is Entry<'tool-use'> => entry.kind === 'tool-use' && !answered.has(entry.id)
    );
    if (open?.name === 'AskUserQuestion') {
        const asked = askedQuestions(open.input);
        if (asked) {
            return asked;
        }
    }
    if (open) {
        return `Claude is asking to use ${open.name}.`;
    }
    const described = typeof pendingAction === 'string' ? pendingAction.trim() : '';
    return described || 'Claude is waiting for an answer.';
}

function askedQuestions(input: unknown): string | null {
    const questions = (input as { questions?: unknown } | null)?.questions;
    if (!Array.isArray(questions)) {
        return null;
    }
    const lines = questions.flatMap((question: { options?: unknown; question?: unknown }) => {
        if (typeof question?.question !== 'string') {
            return [];
        }
        const options = Array.isArray(question.options)
            ? question.options.flatMap((option: { label?: unknown }) =>
                  typeof option?.label === 'string' ? [option.label] : []
              )
            : [];
        return [
            options.length > 0
                ? `${question.question} (${options.join(' / ')})`
                : question.question,
        ];
    });
    return lines.length > 0 ? lines.join('\n') : null;
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

/** Cost, tokens, and the pull request Claude opened, across every turn of this Run. */
function evidence(
    entries: ClaudeLogEntry[]
): Pick<CloudAgentProviderObservation, 'branches' | 'usage'> {
    const results = entries.filter((entry): entry is Entry<'result'> => entry.kind === 'result');
    const branch = pullRequestBranch(entries);
    return {
        ...(branch ? { branches: [branch] } : {}),
        ...(results.length > 0
            ? {
                  usage: {
                      costUsd: results.some((result) => result.costUsd !== null)
                          ? results.reduce((total, result) => total + (result.costUsd ?? 0), 0)
                          : null,
                      inputTokens: results.reduce((total, result) => total + result.usage.input, 0),
                      outputTokens: results.reduce(
                          (total, result) => total + result.usage.output,
                          0
                      ),
                  },
              }
            : {}),
    };
}

const pullRequestUrl = /https:\/\/github\.com\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/pull\/\d+/gu;
const pushedBranch =
    /\bgit\s+push\b[^\n;&|]*?\s(?:origin|-u\s+origin|--set-upstream\s+origin)\s+(?:HEAD:)?([A-Za-z0-9._/-]+)/u;

/**
 * Claude reports no branch record, so the branch is the one its own `git push`
 * named and the pull request is the last GitHub link it wrote. Both or neither:
 * a branch without its repository cannot be recorded truthfully.
 */
function pullRequestBranch(entries: ClaudeLogEntry[]): CloudAgentBranch | null {
    let url: { repository: string; value: string } | null = null;
    let branch: string | null = null;
    for (const entry of entries) {
        const text =
            entry.kind === 'assistant-text'
                ? entry.text
                : entry.kind === 'result'
                  ? (entry.text ?? '')
                  : '';
        for (const match of text.matchAll(pullRequestUrl)) {
            url = { repository: match[1] as string, value: match[0] };
        }
        const command =
            entry.kind === 'tool-use'
                ? (entry.input as { command?: unknown } | null)?.command
                : null;
        const pushed = typeof command === 'string' ? pushedBranch.exec(command)?.[1] : undefined;
        if (pushed) {
            branch = pushed;
        }
    }
    return url && branch ? { branch, pullRequestUrl: url.value, repository: url.repository } : null;
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

function lastOf<T, S extends T>(items: T[], match: (item: T) => item is S): S | undefined;
function lastOf<T>(items: T[], match: (item: T) => boolean): T | undefined;
function lastOf<T>(items: T[], match: (item: T) => boolean): T | undefined {
    for (let index = items.length - 1; index >= 0; index--) {
        const item = items[index] as T;
        if (match(item)) {
            return item;
        }
    }
    return undefined;
}
