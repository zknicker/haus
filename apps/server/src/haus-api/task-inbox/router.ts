import {
    taskInboxClearInputSchema,
    taskInboxListInputSchema,
    taskInboxListSchema,
    taskInboxMutationResultSchema,
    taskInboxRestoreInputSchema,
} from '@haus/api';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { taskInboxChangedTopic } from '../../realtime/topics.ts';
import { clearTaskInbox, listTaskInbox, restoreTaskInbox } from '../../tasks/task-inbox.ts';
import { taskProcedure } from '../task/procedure.ts';
import { createRouter } from '../trpc.ts';

export const taskInboxRouter = createRouter({
    clear: taskProcedure
        .input(taskInboxClearInputSchema)
        .output(taskInboxMutationResultSchema)
        .mutation(async ({ ctx, input }) => {
            const { changed, event } = await clearTaskInbox(ctx.hausDb, ctx.member, input);
            publishRealtime(event);
            return { changed };
        }),
    list: taskProcedure
        .input(taskInboxListInputSchema)
        .output(taskInboxListSchema)
        .query(async ({ ctx, input }) => ({
            items: await listTaskInbox(ctx.hausDb, ctx.member, input.serverId),
        })),
    /** Only the person whose items changed: the topic carries them as `audienceUserId`. */
    onChanged: realtimeSubscription({ topic: taskInboxChangedTopic }),
    restore: taskProcedure
        .input(taskInboxRestoreInputSchema)
        .output(taskInboxMutationResultSchema)
        .mutation(async ({ ctx, input }) => {
            const { changed, event } = await restoreTaskInbox(ctx.hausDb, ctx.member, input);
            publishRealtime(event);
            return { changed };
        }),
});
