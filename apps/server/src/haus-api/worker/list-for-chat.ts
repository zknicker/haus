import { chatWorkerListSchema, workerListForChatInputSchema } from '@haus/api';
import { listChatWorker } from '../../workers/list-chat-worker.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listChatWorkerProcedure = chatProcedure
    .input(workerListForChatInputSchema)
    .output(chatWorkerListSchema)
    .query(({ ctx, input }) => listChatWorker(ctx.hausDb, ctx.member, input));
