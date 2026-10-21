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

/** The local date and slot a daytime heartbeat's dedupe key names, or null for any other key. */
export function heartbeatSlotOfKey(dedupeKey: string): { localDate: string; slot: string } | null {
    if (!dedupeKey.startsWith('heartbeat:')) {
        return null;
    }
    const parts = dedupeKey.split(':');
    // `heartbeat:<agentId>:<localDate>:<slot>`, where a slot such as 08:00 holds a colon.
    const [, , localDate, ...slot] = parts;
    return localDate && slot.length > 0 ? { localDate, slot: slot.join(':') } : null;
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
