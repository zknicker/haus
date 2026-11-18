import { formatCloudAgentWorkLink } from '@haus/api';
import type { z } from 'zod';

import type { agentCloudAgentStartResponseSchema } from './agent-api-schemas.ts';
import { formatHistoryLine } from './agent-format.ts';

type CloudAgentStartResponse = z.infer<typeof agentCloudAgentStartResponseSchema>;

export function renderCloudAgentStart(
    response: CloudAgentStartResponse,
    request: { repository: string; startingRef: string | null; target: string }
): string {
    return response.state === 'held'
        ? renderHeld(request.target, response)
        : renderStarted(response, request);
}

/** `haus cloud-agent inspect` without `--work`: one line per work, each with its link. */
export function renderCloudAgentWorkList(works: readonly CloudAgentWorkLinkSource[]): string {
    if (works.length === 0) {
        return 'No cloud agent work found.\n';
    }
    const rows = works.map((work) => {
        // Only a pinned Claude launch carries a name; every other provider is null.
        const environment = work.environmentName ? ` [${work.environmentName}]` : '';
        return `${work.id} [${work.status}]${environment} ${work.title} (${work.repository})\n  Link: ${formatCloudAgentWorkLink(work.title, work.id)}`;
    });
    return `${rows.join('\n')}\n${linkSentence}\n`;
}

/** `haus cloud-agent inspect --work <id>`: the recorded work, then its link. */
export function renderCloudAgentWorkDetail(works: readonly CloudAgentWorkLinkSource[]): string {
    const links = works.map((work) => `Link: ${formatCloudAgentWorkLink(work.title, work.id)}`);
    const reportPointers = works
        // One pointer per work, not per Run: `--report` always reads the newest
        // Run with one, so a second identical line would add nothing (TECH-8).
        .filter((work) => work.runs.some(runHasMoreReport))
        .map((work) => reportPointerLine(work.id));
    const trailer = [...links, ...reportPointers, ...(links.length ? [linkSentence] : [])];
    return `${JSON.stringify(works, null, 2)}\n${trailer.length ? `${trailer.join('\n')}\n` : ''}`;
}

/**
 * The Run `haus cloud-agent inspect --work <id> --report` shows: the one
 * named by `--run`, or else the newest Run on that work carrying a report.
 */
export function findCloudAgentReportRun(
    works: readonly CloudAgentWorkReportSource[],
    workId: string,
    runId?: string
): CloudAgentRunReportSource | undefined {
    const work = works.find((candidate) => candidate.id === workId);
    const runs = work?.runs ?? [];
    return runId ? runs.find((run) => run.runId === runId) : runs.find((run) => run.report);
}

/** The plain-text block `--report` prints for one resolved Run. */
export function renderCloudAgentReportText(run: CloudAgentRunReportSource): string {
    const clippedLine = run.report?.clipped ? '\n[clipped at 64 KiB]' : '';
    return `${run.report?.text ?? ''}${clippedLine}\n`;
}

function reportPointerLine(workId: string): string {
    return `More: haus cloud-agent inspect --work ${workId} --report`;
}

/** Mirrors `hasFullReport`: the full report outgrew the capped `summary` already shown. */
function runHasMoreReport(run: CloudAgentRunReportSource): boolean {
    return Boolean(run.report) && (run.report?.text.length ?? 0) > (run.summary?.length ?? 0);
}

export interface CloudAgentRunReportSource {
    report: { clipped: boolean; text: string } | null;
    runId: string;
    summary?: string | null;
}

interface CloudAgentWorkReportSource {
    id: string;
    runs: readonly CloudAgentRunReportSource[];
}

interface CloudAgentWorkLinkSource extends CloudAgentWorkReportSource {
    environmentName?: string | null;
    repository: string;
    status: string;
    title: string;
}

const linkSentence =
    'To show this work in another conversation, paste its Link line into haus message send.';

function renderStarted(
    receipt: Extract<CloudAgentStartResponse, { state: 'started' }>,
    request: { repository: string; startingRef: string | null }
): string {
    const ref = request.startingRef ? `@${request.startingRef}` : '';
    const lines = [
        `Cloud agent launching for ${request.repository}${ref}. Work ID: ${receipt.work.id}`,
        `Posted to ${receipt.target}. Message ID: ${receipt.messageId}`,
        `Haus wakes you on ${receipt.target} when the run settles, a failed launch included, and when its pull request becomes ready or its checks finish; post what you learn yourself.`,
        // Agents paste this line; they never build a work link themselves.
        `Link: ${formatCloudAgentWorkLink(receipt.work.title, receipt.work.id)}`,
        linkSentence,
    ];
    return `${lines.join('\n')}\n`;
}

/** Mirrors the `haus message send` hold so the Agent reads the same shape. */
function renderHeld(
    target: string,
    response: Extract<CloudAgentStartResponse, { state: 'held' }>
): string {
    const shown = response.shownMessages.length;
    const lines = [
        `Freshness hold: showing latest ${shown} of ${response.newMessageCount} newer messages.`,
    ];
    if (response.omittedMessageCount > 0) {
        lines.push(
            `${response.omittedMessageCount} earlier newer messages were omitted. Use haus message read --target "${target}" to review them.`
        );
    }
    lines.push(
        'The cloud agent was not started: no card was posted and nothing was launched. Review this context.'
    );
    if (response.formalMentionCount > 0) {
        lines.push(
            `You were formally mentioned in ${response.formalMentionCount} of these newer messages.`
        );
    }
    lines.push(
        '',
        ...response.shownMessages.map(formatHistoryLine),
        '',
        `If the launch still belongs in ${target}, run the same haus cloud-agent start command again. If the newer messages change where or whether it belongs, launch it there or skip it.`
    );
    return `${lines.join('\n')}\n`;
}
