import { computerUseRequestsInputSchema, computerUseRequestsSchema } from '@haus/api';
import { listComputerUseRequests } from '../../computer-use/list-computer-use-requests.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const computerUseRequestsProcedure = chatProcedure
    .input(computerUseRequestsInputSchema)
    .output(computerUseRequestsSchema)
    .query(async ({ ctx, input }) => ({
        requests: await listComputerUseRequests(ctx.hausDb, ctx.member, input),
    }));
