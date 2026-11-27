import { type CrewReportAttention, formatTaskTarget } from '@haus/api';

const reportGuidance =
    "Each report is also posted in its Task's chat. The person who asked you for the work hears from you only in what you write to them, where they asked. Answer a Task with `haus task send <id>`, or move its Issue on with `haus issue update`.";

/** One line per crew report, its text, and the guidance, as the Captain's turn input. */
export function composeCrewReportInput(reports: readonly CrewReportAttention[]) {
    return [
        `${reports.length} ${plural(reports.length, 'crew report')}:`,
        ...reports.flatMap(formatReport),
        '',
        reportGuidance,
    ].join('\n');
}

export function formatCrewReportsNotice(total: number) {
    return `${total} ${plural(total, 'crew report')}`;
}

function formatReport(report: CrewReportAttention) {
    const issues = report.issueCodes.length > 0 ? ` ${report.issueCodes.join(' ')}` : '';
    const head = `[Haus crew report ${formatTaskTarget(report.taskShortId)} outcome=${report.outcome}${issues}] ${flattened(report.title)}`;
    return [
        head,
        ...(report.outcome === 'unreported'
            ? [
                  'It ended a turn you directed without a report. Its last message:',
                  quoted(report.text),
              ]
            : [quoted(report.text)]),
        ...(report.ask ? [`Ask: ${flattened(report.ask)}`] : []),
        ...report.pullRequests.map(
            (pull) => `PR: ${pull.url} · ${pull.state} · checks ${pull.checks}`
        ),
        ...report.issueEdits.map((edit) => `Issue: ${edit.code} ${edit.change}`),
    ];
}

function quoted(text: string) {
    const lines = text.trim().split('\n');
    return text.trim() ? lines.map((line) => `> ${line}`.trimEnd()).join('\n') : '> (nothing)';
}

function plural(count: number, singular: string) {
    return count === 1 ? singular : `${singular}s`;
}

function flattened(value: string) {
    return value.replaceAll(/\s+/gu, ' ').trim();
}
