import {
    type PullRequestReading,
    type WorkerFailure,
    type WorkerReport,
    type WorkerReportAttention,
    type WorkerReportsNotice,
    formatWorkerPlace,
} from '@haus/api';
import { indentContinuationLines } from './inbox-header-format.ts';

export function formatWorkerReport(attention: WorkerReportAttention) {
    const { outcome, taskKey, workerId } = attention;
    const label = outcome.kind === 'report' ? outcome.report.outcome : outcome.kind;
    return [
        `[worker report · ${taskKey} · ${label} · Worker on ${formatWorkerPlace(attention.place)} (${workerId}) · turn ${attention.turnNumber}]`,
        ...outcomeLines(attention),
        ...pullRequestLines(attention),
        ...(attention.citedFiles.length > 0
            ? [
                  `Files: ${attention.citedFiles.map((file) => `${file.path}@${file.revisionId}`).join(', ')}`,
              ]
            : []),
        closingLine(attention),
    ].join('\n');
}

export function formatWorkerReportsNotice(notice: WorkerReportsNotice) {
    return `${notice.total} Worker ${notice.total === 1 ? 'report' : 'reports'} in ${notice.taskKey}`;
}

function outcomeLines(attention: WorkerReportAttention) {
    const { outcome } = attention;
    switch (outcome.kind) {
        case 'report':
            return [
                ...(outcome.report.text ? [indentContinuationLines(outcome.report.text)] : []),
                ...(outcome.report.outcome === 'needs-you'
                    ? askLines(attention, outcome.report)
                    : []),
            ];
        case 'failed':
            return [
                `No report: ${failureReasons[outcome.reason]}${outcome.detail ? ` ${indentContinuationLines(outcome.detail)}` : ''}`,
            ];
        case 'stopped':
            return ['The turn was stopped before it reported.'];
        default:
            return outcome satisfies never;
    }
}

function askLines(attention: WorkerReportAttention, report: WorkerReport) {
    if (report.questions) {
        return [
            attention.person
                ? `Asked @${attention.person.handle} in the Task. Their answer reaches the Worker as its next turn.`
                : 'The Worker asked these questions, and they are for you. Answer with a numbered list in one follow-up.',
        ];
    }
    const ask =
        report.ask && report.ask !== report.text
            ? [`Ask: ${indentContinuationLines(report.ask)}`]
            : [];
    if (attention.person) {
        return [
            ...ask,
            `Asked @${attention.person.handle} in the Task. An answer from the Worker's card reaches the Worker as its next turn.`,
        ];
    }
    const refused = report.personRefused
        ? `The Worker named @${report.personRefused}, who cannot be asked in this Task, so the ask is for you.`
        : 'The ask is for you.';
    return [...ask, refused];
}

function pullRequestLines(attention: WorkerReportAttention) {
    const read = new Set(attention.pullRequests.map((reading) => reading.url));
    const unread =
        attention.outcome.kind === 'report'
            ? attention.outcome.report.pullRequestUrls.filter((url) => !read.has(url))
            : [];
    return [...attention.pullRequests.map(formatReading), ...unread.map((url) => `PR: ${url}`)];
}

function formatReading(reading: PullRequestReading) {
    const checks =
        reading.checks === 'none' || reading.checks === 'unknown'
            ? []
            : [`checks ${reading.checks}`];
    const review =
        reading.review === 'approved' || reading.review === 'changes-requested'
            ? [reading.review]
            : [];
    return [`PR: ${reading.url}`, reading.state, ...checks, ...review].join(' · ');
}

function closingLine(attention: WorkerReportAttention) {
    const { outcome, taskKey, workerId } = attention;
    const followUp = `haus worker send --worker ${workerId}`;
    if (outcome.kind === 'stopped') {
        return `Nothing was posted in ${taskKey}.`;
    }
    if (outcome.kind === 'failed') {
        return `Nothing was posted in ${taskKey}, so tell the Task what matters. Send a follow-up with ${followUp}, or start a new Worker.`;
    }
    const posted = `The report is already posted in ${taskKey}. Post only what it does not say.`;
    switch (outcome.report.outcome) {
        case 'needs-you':
            return `${posted} Answer the Worker with ${followUp}, or start a narrower Worker.`;
        case 'failed':
            return `${posted} Send a follow-up with ${followUp}, or start a narrower Worker.`;
        case 'done':
            return `${posted} Send a follow-up with ${followUp} if more is needed.`;
        default:
            return outcome.report.outcome satisfies never;
    }
}

const failureReasons: Record<WorkerFailure, string> = {
    'harness-error': 'the harness failed to start or crashed.',
    'launch-refused': 'the provider refused to start the turn.',
    'machine-offline': 'its Computer stayed offline for 30 minutes during the turn.',
    'machine-removed': 'its Computer was removed.',
    'no-report': 'the turn ended without a report.',
    'place-off': 'Workers were turned off on its Computer while the turn waited.',
    'provider-error': 'the provider ended the run in error with no result.',
    'provider-expired': 'the provider expired the run.',
};
