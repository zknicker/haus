import { createRouter } from '../trpc.ts';
import { listReposProcedure } from './list.ts';

/** The Server's repo list (ADR 0060). Folders are added and removed per Device, under `computer`. */
export const repoRouter = createRouter({
    list: listReposProcedure,
});
