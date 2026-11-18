import { createRouter } from '../trpc.ts';
import { createTaskKeyProcedure } from './create.ts';
import { listTaskKeysProcedure } from './list.ts';

export const taskKeyRouter = createRouter({
    create: createTaskKeyProcedure,
    list: listTaskKeysProcedure,
});
