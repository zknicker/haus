import { createRouter } from '../trpc.ts';
import { cancelWorkerProcedure } from './cancel.ts';
import { listActiveWorkerProcedure } from './list-active.ts';
import { listWorkerAutomationsProcedure } from './list-automations.ts';
import { listChatWorkerProcedure } from './list-for-chat.ts';
import { listWorkerLinksProcedure } from './list-links.ts';
import { onWorkerUpdatedProcedure } from './on-updated.ts';

/**
 * Humans read Worker and may cancel it. Everything else about
 * a work — its launch, progress, and settlement — is Agent and Computer work.
 */
export const workerRouter = createRouter({
    cancel: cancelWorkerProcedure,
    listActive: listActiveWorkerProcedure,
    listAutomations: listWorkerAutomationsProcedure,
    listForChat: listChatWorkerProcedure,
    listLinks: listWorkerLinksProcedure,
    onUpdated: onWorkerUpdatedProcedure,
});
