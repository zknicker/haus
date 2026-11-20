import { workerAutomationInputSchema, workerAutomationListSchema } from '@haus/api';
import { listWorkerAutomations } from '../../workers/list-worker-automations.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listWorkerAutomationsProcedure = chatProcedure
    .input(workerAutomationInputSchema)
    .output(workerAutomationListSchema)
    .query(({ ctx, input }) => listWorkerAutomations(ctx.hausDb, ctx.member, input));
