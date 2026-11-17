import {
    type CloudAgentReport,
    cloudAgentReportMaxLength,
    cloudAgentSummaryMaxLength,
} from '@haus/api';

/**
 * A provider Run's full report (TECH-8), explicitly flagged when the hard
 * cap cut it, so a reader never silently loses the boundary the way an
 * in-band ellipsis would hide it. Precondition: callers only call this with
 * non-empty (post-trim) text — every call site already guards on the
 * provider's own result text being present before reaching here.
 */
export function boundedReport(text: string, limit = cloudAgentReportMaxLength): CloudAgentReport {
    const trimmed = text.trim();
    return trimmed.length > limit
        ? { clipped: true, text: trimmed.slice(0, limit) }
        : { clipped: false, text: trimmed };
}

/**
 * The short view shown in place of the full report, derived FROM an already
 * captured report rather than from the original source text again, so
 * `summary` is always a truncation-consistent prefix of `report.text` and
 * never an independently cut sibling that can drift from it.
 */
export function boundedSummary(
    report: CloudAgentReport,
    limit = cloudAgentSummaryMaxLength
): string {
    const { text } = report;
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
