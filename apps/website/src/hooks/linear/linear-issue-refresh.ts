import type { LinearIssueResult } from '@haus/api';

/**
 * A read's signed thumbnail URL is valid for 10 minutes
 * (specs/linear-app.md#signed-urls); rereading before then mints a fresh one.
 */
const thumbnailRefreshMs = 8 * 60_000;

/** Only a read carrying a thumbnail goes stale on a clock; events keep the rest current. */
export function linearIssueRefetchInterval(result: LinearIssueResult | undefined) {
    return result?.status === 'available' && result.issue.thumbnailUrl ? thumbnailRefreshMs : false;
}
