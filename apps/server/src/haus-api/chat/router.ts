import { createRouter } from '../trpc.ts';
import { archiveChannelProcedure } from './archive-channel.ts';
import { createChannelProcedure } from './create-channel.ts';
import { deleteChannelProcedure } from './delete-channel.ts';
import { listChatEngagementsProcedure } from './engagements.ts';
import { ensureAgentDmProcedure } from './ensure-agent-dm.ts';
import { ensureDmProcedure } from './ensure-dm.ts';
import { getChatProcedure } from './get.ts';
import { listChatsProcedure } from './list.ts';
import { listArchivedChatsProcedure } from './list-archived.ts';
import { markChatReadProcedure } from './mark-read.ts';
import { listMentionOptionsProcedure } from './mention-options.ts';
import { readChatMessageProcedure } from './message.ts';
import { readMessageRoutingProcedure } from './message-routing.ts';
import { listChatMessagesProcedure } from './messages.ts';
import { onCompositionProcedure } from './on-composition.ts';
import { onChatEngagementProcedure } from './on-engagement.ts';
import { onChatLifecycleProcedure } from './on-lifecycle.ts';
import { onMessageCreatedProcedure } from './on-message-created.ts';
import { onMessageReactionUpdatedProcedure } from './on-message-reaction-updated.ts';
import { onChatReadProcedure } from './on-read.ts';
import { onChatThoughtProcedure } from './on-thought.ts';
import { publishCompositionProcedure } from './publish-composition.ts';
import { reactToChatMessageProcedure } from './react.ts';
import { searchChatMessagesProcedure } from './search.ts';
import { sendChatMessageProcedure } from './send.ts';
import { unarchiveChannelProcedure } from './unarchive-channel.ts';
import { unreadChatCountProcedure } from './unread-chat-count.ts';
import { listUnreadPreviewsProcedure } from './unread-previews.ts';
import { updateChannelProcedure } from './update-channel.ts';

export const chatRouter = createRouter({
    archiveChannel: archiveChannelProcedure,
    createChannel: createChannelProcedure,
    deleteChannel: deleteChannelProcedure,
    engagements: listChatEngagementsProcedure,
    ensureDm: ensureDmProcedure,
    ensureAgentDm: ensureAgentDmProcedure,
    get: getChatProcedure,
    list: listChatsProcedure,
    listArchived: listArchivedChatsProcedure,
    markRead: markChatReadProcedure,
    mentionOptions: listMentionOptionsProcedure,
    message: readChatMessageProcedure,
    messages: listChatMessagesProcedure,
    messageRouting: readMessageRoutingProcedure,
    onComposition: onCompositionProcedure,
    onEngagement: onChatEngagementProcedure,
    onThought: onChatThoughtProcedure,
    onLifecycle: onChatLifecycleProcedure,
    onMessageCreated: onMessageCreatedProcedure,
    onMessageReactionUpdated: onMessageReactionUpdatedProcedure,
    onRead: onChatReadProcedure,
    publishComposition: publishCompositionProcedure,
    react: reactToChatMessageProcedure,
    search: searchChatMessagesProcedure,
    send: sendChatMessageProcedure,
    updateChannel: updateChannelProcedure,
    unarchiveChannel: unarchiveChannelProcedure,
    unreadChatCount: unreadChatCountProcedure,
    unreadPreviews: listUnreadPreviewsProcedure,
});
