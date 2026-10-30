import type { Ref } from 'react';
import type { ChatComposerHandle } from '../chat/chat-composer.tsx';
import { ChatComposer } from '../chat/chat-composer-variants.tsx';
import { pendingThreadReplyKey } from '../chat/use-pending-messages.ts';

/** Where an open row's reply goes, and whether it can go anywhere. */
export type UnreadRowReply =
    | { kind: 'closed' }
    | {
          /** A DM with an Agent keys its draft by the Agent, as the DM's own composer does. */
          agentDmId: null | string;
          /** The Channel or DM; a Thread reply names its parent. */
          chatId: string;
          /** What the composer's placeholder and accessible name address, as the conversation's does. */
          chatName: string;
          kind: 'chat';
          serverId: string;
      }
    | {
          anchorMessageId: string;
          chatId: string;
          chatName: string;
          kind: 'thread';
          serverId: string;
      };

/**
 * The open row's input bar: the very composer its conversation renders
 * (ADR 0050) — the stock `ChatComposer` in the Chat view's own `primary`
 * shell, with the conversation's draft key and the Thread view's "Add a
 * reply…" for a Thread — so a draft started here is waiting there, and the
 * other way round. A Channel the viewer can no longer post in (archived, or a
 * retired Agent's DM) renders none, as the Chat does.
 *
 * It does not take focus when it mounts. A Chat's composer is where that
 * view's keys go, but here the row opens on load and as J and K move, and
 * a self-focusing editor would swallow the very keys that move it. R, or a
 * click into the bar, focuses it (`ref`).
 *
 * `onSent` hears a send the moment it starts — sending is optimistic, and the
 * conversation's pending row carries the message from there.
 */
export function UnreadRowComposer({
    onSent,
    ref,
    reply,
}: {
    onSent: () => void;
    ref: Ref<ChatComposerHandle>;
    reply: UnreadRowReply;
}) {
    switch (reply.kind) {
        case 'closed':
            return null;
        case 'thread':
            return (
                <ChatComposer
                    autoFocus={false}
                    chatId={reply.chatId}
                    chatName={reply.chatName}
                    onSend={onSent}
                    pendingChatId={pendingThreadReplyKey(reply.anchorMessageId)}
                    placeholder="Add a reply…"
                    ref={ref}
                    serverId={reply.serverId}
                    thread={{ anchorMessageId: reply.anchorMessageId }}
                />
            );
        default:
            return (
                <ChatComposer
                    agentDmId={reply.agentDmId ?? undefined}
                    autoFocus={false}
                    chatId={reply.chatId}
                    chatName={reply.chatName}
                    onSend={onSent}
                    pendingChatId={reply.chatId}
                    ref={ref}
                    serverId={reply.serverId}
                />
            );
    }
}
