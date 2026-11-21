import { createRouter } from '../trpc.ts';
import { decideComputerUseProcedure } from './decide.ts';
import { onComputerUseRequestUpdatedProcedure } from './on-request-updated.ts';
import { computerUseRequestsProcedure } from './requests.ts';

export const computerUseRouter = createRouter({
    decide: decideComputerUseProcedure,
    onRequestUpdated: onComputerUseRequestUpdatedProcedure,
    requests: computerUseRequestsProcedure,
});
