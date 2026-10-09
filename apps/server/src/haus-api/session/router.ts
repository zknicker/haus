import { createRouter } from '../trpc.ts';
import { refreshSocketSessionProcedure } from './refresh.ts';

export const sessionRouter = createRouter({
    refresh: refreshSocketSessionProcedure,
});
