import { agentHeartbeatsInputSchema, agentHeartbeatsSchema } from '@haus/api';
import { readAgentHeartbeats } from '../../heartbeat/heartbeat-lanes.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentHeartbeatsProcedure = memberProcedure
    .input(agentHeartbeatsInputSchema)
    .output(agentHeartbeatsSchema)
    .query(async ({ ctx, input }) => await readAgentHeartbeats(ctx.hausDb, ctx.member, input));
