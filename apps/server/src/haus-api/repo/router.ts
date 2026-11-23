import { createRouter } from '../trpc.ts';
import { listReposProcedure } from './list.ts';

export const repoRouter = createRouter({
    list: listReposProcedure,
});
