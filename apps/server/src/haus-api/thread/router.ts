import { createRouter } from '../trpc.ts';
import { getThreadProcedure } from './get.ts';
import { listEarlierThreadsProcedure } from './list-earlier.ts';
import { listOpenThreadsProcedure } from './list-open.ts';
import { listUnreadThreadsProcedure } from './list-unread.ts';
import { onThreadClosedUpdatedProcedure } from './on-closed-updated.ts';
import { onThreadFollowUpdatedProcedure } from './on-follow-updated.ts';
import { setThreadClosedProcedure } from './set-closed.ts';
import { setThreadFollowProcedure } from './set-follow.ts';

export const threadRouter = createRouter({
    get: getThreadProcedure,
    listEarlier: listEarlierThreadsProcedure,
    listOpen: listOpenThreadsProcedure,
    listUnread: listUnreadThreadsProcedure,
    onClosedUpdated: onThreadClosedUpdatedProcedure,
    onFollowUpdated: onThreadFollowUpdatedProcedure,
    setClosed: setThreadClosedProcedure,
    setFollow: setThreadFollowProcedure,
});
