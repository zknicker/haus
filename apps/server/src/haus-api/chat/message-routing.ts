import { messageRoutingDebugSchema, messageRoutingInputSchema } from '@haus/api';
import { readMessageRouting } from '../../message-routing/read-message-routing.ts';
import { chatProcedure } from './procedure.ts';

export const readMessageRoutingProcedure = chatProcedure
    .input(messageRoutingInputSchema)
    .output(messageRoutingDebugSchema)
    .query(async ({ ctx, input }) => await readMessageRouting(ctx.hausDb, ctx.member, input));
