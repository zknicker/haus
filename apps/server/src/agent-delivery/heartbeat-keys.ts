/**
 * Inbox identities of the chatless heartbeat attentions (specs/heartbeat.md#wire-contract).
 * One module so the request handler, the report route, and the run frames agree on them.
 */

export function dreamDedupeKey(agentId: string, localDate: string): string {
    return `dream:${agentId}:${localDate}`;
}

export function heartbeatDedupeKey(agentId: string, localDate: string, slot: string): string {
    return `heartbeat:${agentId}:${localDate}:${slot}`;
}

const reportPrefix = 'heartbeat-report:';

/** A heartbeat's report row; the run id it carries is recovered with {@link heartbeatRunIdOfReport}. */
export function heartbeatReportDedupeKey(heartbeatRunId: string): string {
    return `${reportPrefix}${heartbeatRunId}`;
}

export function heartbeatRunIdOfReport(dedupeKey: string): string {
    if (!dedupeKey.startsWith(reportPrefix)) {
        throw new Error(`Inbox item ${dedupeKey} is not a heartbeat report.`);
    }
    return dedupeKey.slice(reportPrefix.length);
}
