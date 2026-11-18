import { cloudAgentWorkLinkListSchema, cloudAgentWorkLinksInputSchema } from '@haus/api';
import { listCloudAgentWorkLinks } from '../../cloud-agents/list-cloud-agent-work-links.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listCloudAgentWorkLinksProcedure = chatProcedure
    .input(cloudAgentWorkLinksInputSchema)
    .output(cloudAgentWorkLinkListSchema)
    .query(({ ctx, input }) => listCloudAgentWorkLinks(ctx.hausDb, ctx.member, input));
