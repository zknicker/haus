import { expect, test } from 'bun:test';
import type { LinearIssueView } from '@haus/api';
import { linearIssueRefetchInterval } from './linear-issue-refresh.ts';

const view = { thumbnailUrl: null } as LinearIssueView;

test('a read with a thumbnail rereads before its 10-minute signed URL expires', () => {
    const interval = linearIssueRefetchInterval({
        issue: { ...view, thumbnailUrl: 'https://haus.chat/api/linear/thumbnail/token' },
        status: 'available',
    });
    expect(interval).toBeGreaterThan(0);
    expect(interval).toBeLessThan(10 * 60_000);
});

test('reads without a thumbnail stay on events alone', () => {
    expect(linearIssueRefetchInterval({ issue: view, status: 'available' })).toBe(false);
    expect(
        linearIssueRefetchInterval({ reason: 'workspace_not_connected', status: 'unavailable' })
    ).toBe(false);
    expect(linearIssueRefetchInterval(undefined)).toBe(false);
});
