import { serverTurnsInputSchema, serverTurnsPageSchema } from '@haus/api';
import { listServerTurns } from '../../server-agents/list-server-turns.ts';
import { memberProcedure } from '../server/procedure.ts';

export const serverTurnsProcedure = memberProcedure
    .input(serverTurnsInputSchema)
    .output(serverTurnsPageSchema)
    .query(async ({ ctx, input }) => await listServerTurns(ctx.hausDb, ctx.member, input));
