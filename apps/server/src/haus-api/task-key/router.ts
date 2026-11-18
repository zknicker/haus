import { createRouter } from '../trpc.ts';
import { createTaskKeyProcedure } from './create.ts';
import { listTaskKeysProcedure } from './list.ts';

/** The Server's Task key ledger (ADR 0053 decision 11). */
export const taskKeyRouter = createRouter({
    create: createTaskKeyProcedure,
    list: listTaskKeysProcedure,
});
