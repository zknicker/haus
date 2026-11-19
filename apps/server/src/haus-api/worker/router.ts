import { createRouter } from '../trpc.ts';
import { listActiveWorkerProcedure } from './list-active.ts';
import { listWorkerAutomationsProcedure } from './list-automations.ts';
import { listChatWorkerProcedure } from './list-for-chat.ts';
import { listWorkerLinksProcedure } from './list-links.ts';
import { onWorkerUpdatedProcedure } from './on-updated.ts';
import { stopWorkerProcedure } from './stop.ts';

/**
 * Humans read Workers and may stop them. Everything else about a Worker, its
 * launch, progress, and settlement, is Agent and Computer work.
 */
export const workerRouter = createRouter({
    listActive: listActiveWorkerProcedure,
    listAutomations: listWorkerAutomationsProcedure,
    listForChat: listChatWorkerProcedure,
    listLinks: listWorkerLinksProcedure,
    onUpdated: onWorkerUpdatedProcedure,
    stop: stopWorkerProcedure,
});
