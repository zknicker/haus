import { expect, test } from 'bun:test';
import { settledLanding } from './use-unread-threads.ts';

const landing = { id: 'message_4', sequence: 4 };

test('a settled list decides the landing', () => {
    expect(settledLanding(landing, false)).toEqual(landing);
    expect(settledLanding(null, false)).toBeNull();
});

test('a refetching list leaves the landing undecided, even when its stale rows say nothing is unread', () => {
    // A local read patch can drop the row before the invalidation refetch lands.
    expect(settledLanding(null, true)).toBeUndefined();
    expect(settledLanding(landing, true)).toBeUndefined();
    expect(settledLanding(undefined, true)).toBeUndefined();
});
