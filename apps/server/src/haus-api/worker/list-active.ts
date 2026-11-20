import { activeWorkerListSchema, workerListActiveInputSchema } from '@haus/api';
import { listActiveWorker } from '../../workers/list-active-worker.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listActiveWorkerProcedure = chatProcedure
    .input(workerListActiveInputSchema)
    .output(activeWorkerListSchema)
    .query(async ({ ctx, input }) => await listActiveWorker(ctx.hausDb, ctx.member, input));
