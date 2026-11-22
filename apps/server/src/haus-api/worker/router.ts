import { createRouter } from '../trpc.ts';
import { dismissWorkerQuestionProcedure } from './dismiss-question.ts';
import { getWorkerProcedure } from './get.ts';
import { listActiveWorkerProcedure } from './list-active.ts';
import { listWorkerAutomationsProcedure } from './list-automations.ts';
import { listChatWorkerProcedure } from './list-for-chat.ts';
import { listWorkerLinksProcedure } from './list-links.ts';
import { onWorkerUpdatedProcedure } from './on-updated.ts';
import { sendWorkerFollowUpProcedure } from './send-follow-up.ts';
import { stopWorkerProcedure } from './stop.ts';

/**
 * People read Workers, send them follow-ups, and stop them. Starting a
 * Worker, its turns, and settlement are Agent and Computer work.
 */
export const workerRouter = createRouter({
    dismissQuestion: dismissWorkerQuestionProcedure,
    get: getWorkerProcedure,
    listActive: listActiveWorkerProcedure,
    listAutomations: listWorkerAutomationsProcedure,
    listForChat: listChatWorkerProcedure,
    listLinks: listWorkerLinksProcedure,
    onUpdated: onWorkerUpdatedProcedure,
    sendFollowUp: sendWorkerFollowUpProcedure,
    stop: stopWorkerProcedure,
});
