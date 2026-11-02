import { createRouter } from '../trpc.ts';
import { adventCalendarProcedure } from './calendar.ts';

export const adventRouter = createRouter({
    calendar: adventCalendarProcedure,
});
