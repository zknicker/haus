import { workerLinkListSchema, workerLinksInputSchema } from '@haus/api';
import { listWorkerLinks } from '../../workers/list-worker-links.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listWorkerLinksProcedure = chatProcedure
    .input(workerLinksInputSchema)
    .output(workerLinkListSchema)
    .query(({ ctx, input }) => listWorkerLinks(ctx.hausDb, ctx.member, input));
