import { cloudAgentAutomationInputSchema, cloudAgentAutomationListSchema } from '@haus/api';
import { listCloudAgentAutomations } from '../../cloud-agents/list-cloud-agent-automations.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listCloudAgentAutomationsProcedure = chatProcedure
    .input(cloudAgentAutomationInputSchema)
    .output(cloudAgentAutomationListSchema)
    .query(({ ctx, input }) => listCloudAgentAutomations(ctx.hausDb, ctx.member, input));
