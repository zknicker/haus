import { createRouter } from '../trpc.ts';
import { listTaskKeysProcedure } from './list.ts';

export const taskKeyRouter = createRouter({
    list: listTaskKeysProcedure,
});
