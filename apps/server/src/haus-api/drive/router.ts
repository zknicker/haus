import { createRouter } from '../trpc.ts';
import { changesDriveProcedure } from './changes.ts';

export const driveRouter = createRouter({
    changes: changesDriveProcedure,
});
