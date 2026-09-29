import { createRouter } from '../trpc.ts';
import { markDoneProcedure } from './mark-done.ts';
import { needsYouProcedure } from './needs-you.ts';

export const inboxRouter = createRouter({
    markDone: markDoneProcedure,
    needsYou: needsYouProcedure,
});
