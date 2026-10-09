import { createRouter } from '../trpc.ts';
import { getThreadProcedure } from './get.ts';
import { onThreadFollowUpdatedProcedure } from './on-follow-updated.ts';
import { setThreadFollowProcedure } from './set-follow.ts';

export const threadRouter = createRouter({
    get: getThreadProcedure,
    onFollowUpdated: onThreadFollowUpdatedProcedure,
    setFollow: setThreadFollowProcedure,
});
