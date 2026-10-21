import { createRouter } from '../trpc.ts';
import { cancelCloudAgentWorkProcedure } from './cancel.ts';
import { listActiveCloudAgentWorkProcedure } from './list-active.ts';
import { listCloudAgentAutomationsProcedure } from './list-automations.ts';
import { listChatCloudAgentWorkProcedure } from './list-for-chat.ts';
import { onCloudAgentWorkUpdatedProcedure } from './on-updated.ts';

/**
 * Humans read Cloud Agent work and may cancel it. Everything else about
 * a work — its launch, progress, and settlement — is Agent and Computer work.
 */
export const cloudAgentWorkRouter = createRouter({
    cancel: cancelCloudAgentWorkProcedure,
    listActive: listActiveCloudAgentWorkProcedure,
    listAutomations: listCloudAgentAutomationsProcedure,
    listForChat: listChatCloudAgentWorkProcedure,
    onUpdated: onCloudAgentWorkUpdatedProcedure,
});
