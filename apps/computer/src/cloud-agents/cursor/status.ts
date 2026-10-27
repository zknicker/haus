import {
    type CloudAgentBranch,
    type CloudAgentStatus,
    type CloudAgentUsage,
    cloudAgentActivityMaxLength,
    cloudAgentBranchRepositorySchema,
    cloudAgentSummaryMaxLength,
} from '@haus/api';
import type { CloudAgentProviderObservation } from '../provider.ts';
import type { CursorBranchReading, CursorRunReading, CursorRunStatus } from './transport.ts';

/**
 * The one place Cursor's Run vocabulary becomes Haus's. Cursor Agent state
 * (`ACTIVE`/`IDLE`/`ARCHIVED`) never appears here: an idle Agent does not prove
 * a Run finished, so only the Run's own status settles work.
 */
export function cloudAgentStatusOf(rawStatus: CursorRunStatus): CloudAgentStatus {
    switch (rawStatus) {
        case 'QUEUED':
            return 'queued';
        case 'CREATING':
        case 'RUNNING':
            return 'running';
        case 'FINISHED':
            return 'completed';
        case 'ERROR':
            return 'failed';
        case 'CANCELLED':
            return 'cancelled';
        case 'EXPIRED':
            return 'expired';
    }
}

/** Cursor's provider-hosted Agent page, the target of "Open in Cursor". */
export function cursorAgentUrl(agentId: string): string {
    return `https://cursor.com/agents?id=${encodeURIComponent(agentId)}`;
}

/**
 * One Cursor Run reading as a bounded Haus observation. Everything Server
 * stores is here; prompts, transcripts, tool traces, and the API key are not.
 */
export function observationOf(
    reading: CursorRunReading,
    context: { agentId: string; observedAt: string }
): CloudAgentProviderObservation {
    const summary = boundedSummary(reading);
    const usage = usageOf(reading);
    const branches = branchesOf(reading.branches);
    const errorCode = reading.errorCode ? bounded(collapse(reading.errorCode), 120) : '';
    return {
        ...(branches.length > 0 ? { branches } : {}),
        ...(errorCode ? { errorCode } : {}),
        observedAt: context.observedAt,
        ...(reading.startedAt ? { startedAt: reading.startedAt } : {}),
        providerAgentId: context.agentId,
        providerRunId: reading.runId,
        providerUrl: cursorAgentUrl(context.agentId),
        rawStatus: reading.rawStatus,
        status: cloudAgentStatusOf(reading.rawStatus),
        ...(summary ? { summary } : {}),
        ...(usage ? { usage } : {}),
    };
}

/** One live line of state while a Run runs. It yields to the Run summary later. */
export function activityOf(summary: string, at: string): { at: string; summary: string } | null {
    const line = bounded(collapse(summary), cloudAgentActivityMaxLength);
    return line ? { at, summary: line } : null;
}

/**
 * Cursor's terminal Run report, retained as evidence. A branch whose reported
 * repository cannot be read back as a repository label at all is dropped
 * rather than reshaped: Haus stores no branch entity and invents no
 * repository.
 */
export function branchesOf(readings: CursorBranchReading[]): CloudAgentBranch[] {
    const branches: CloudAgentBranch[] = [];
    for (const reading of readings) {
        const repository = repositoryOf(reading.repoUrl);
        const branch = reading.branch ? bounded(reading.branch, 300) : '';
        if (!(repository && branch)) {
            continue;
        }
        branches.push({
            branch,
            pullRequestUrl: reading.prUrl && reading.prUrl.length <= 2000 ? reading.prUrl : null,
            repository,
        });
        if (branches.length === 50) {
            break;
        }
    }
    return branches;
}

/**
 * One repository label from a Cursor repository reference. Cursor names a
 * repository in whatever shape its Git metadata carries — the scheme-less
 * `github.com/owner/name` a Run reports, an HTTPS clone URL, an SSH remote —
 * so all of them read back to `owner/name` on GitHub, and to the
 * host-qualified `host/owner/name` elsewhere, which keeps the branch as
 * evidence instead of discarding it for want of a GitHub shape.
 */
export function repositoryOf(repoUrl: string): string | null {
    const remote = repoUrl
        .trim()
        .replace(/\/+$/u, '')
        .replace(/\.git$/iu, '')
        .replace(/\/+$/u, '');
    const match =
        // scheme://[user@]host[:port]/path
        /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)(?::\d+)?\/(.+)$/iu.exec(remote) ??
        // [user@]host:path, Git's SSH shorthand
        /^(?:[^@\s/]+@)?([^\s/:]+\.[^\s/:]+):(.+)$/u.exec(remote) ??
        // host/path, the shape a Cursor Run's Git metadata reports
        /^([^\s/:]+\.[^\s/:]+)\/(.+)$/u.exec(remote);
    const host = match?.[1]?.toLowerCase() ?? null;
    const segments = (match?.[2] ?? remote).split('/').filter((segment) => segment.length > 0);
    const label = labelOf(host, segments);
    const parsed = label ? cloudAgentBranchRepositorySchema.safeParse(label) : null;
    return parsed?.success ? parsed.data : null;
}

/**
 * Per-Run tokens and optional cost, exactly as Cursor reports them. Cost is
 * eventually consistent and can lag a terminal Run; it is never a claim about
 * plan capacity, remaining allowance, or reset time.
 */
export function usageOf(reading: CursorRunReading): CloudAgentUsage | null {
    if (!reading.usage) {
        return null;
    }
    const { chargedCents, inputTokens, outputTokens } = reading.usage;
    return {
        costUsd: chargedCents === null ? null : Math.max(0, chargedCents) / 100,
        inputTokens: Math.max(0, Math.trunc(inputTokens)),
        outputTokens: Math.max(0, Math.trunc(outputTokens)),
    };
}

/** The Run's own words: its result when it has one, its error when it failed. */
function boundedSummary(reading: CursorRunReading): string | null {
    const text = reading.result ?? reading.errorMessage;
    return text ? bounded(collapse(text), cloudAgentSummaryMaxLength) : null;
}

/**
 * GitHub owns the `owner/name` shape, and every other host keeps its own path
 * — a nested group off GitHub is still one repository, not an owner. A remote
 * with no recognizable host is only a label when it already reads as
 * `owner/name`.
 */
function labelOf(host: string | null, segments: string[]): string | null {
    if (host === null) {
        return segments.length === 2 ? segments.join('/') : null;
    }
    if (host === 'github.com' || host === 'www.github.com') {
        return segments.length >= 2 ? segments.slice(0, 2).join('/') : null;
    }
    return segments.length >= 2 ? [host, ...segments].join('/') : null;
}

function collapse(value: string): string {
    return value.replace(/\s+/gu, ' ').trim();
}

function bounded(value: string, limit: number): string {
    const trimmed = value.trim();
    return trimmed.length > limit ? trimmed.slice(0, limit).trimEnd() : trimmed;
}
