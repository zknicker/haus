import type { Ask } from '@haus/api';
import { Button } from '@heroui/react';
import { ActionCard } from '../../components/chats/action-card.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useChatMessageSend } from '../../hooks/servers/use-chat-message-send.ts';
import type { TranscriptRenderContextValue } from '../chats/chat-transcript-render-context.tsx';
import type { TranscriptActorProfile } from '../chats/transcript-contract.ts';

export function AskAnswerCard({
    ask,
    addressee,
    reply,
}: {
    ask: Ask;
    addressee: TranscriptActorProfile | null;
    reply: NonNullable<TranscriptRenderContextValue['threadAskReply']>;
}) {
    const send = useChatMessageSend();
    if (ask.status === 'answered') {
        return null;
    }
    const canAnswer = reply.answerableMessageId === ask.messageId;
    const spent = send.isPending || send.isSuccess;
    return (
        <ActionCard
            actionKind="ask"
            actionStatus="open"
            aria-label="Answer ask"
            className="bg-nested-surface"
        >
            <ActionCard.Header>
                {addressee ? (
                    <ActionCard.Mark>
                        <EntityAvatar name={addressee.name} size={32} src={addressee.avatarUrl} />
                    </ActionCard.Mark>
                ) : null}
                <ActionCard.Content>
                    <ActionCard.Title>
                        {addressee ? `Ask for ${addressee.name}` : 'Ask'}
                    </ActionCard.Title>
                    <ActionCard.Description>Awaiting answer</ActionCard.Description>
                </ActionCard.Content>
            </ActionCard.Header>
            {canAnswer && ask.options.length > 0 ? (
                <ActionCard.Actions>
                    {ask.options.map((option, index) => (
                        <Button
                            isDisabled={spent}
                            key={option}
                            onPress={() =>
                                send.mutate({
                                    attachmentIds: [],
                                    chatId: reply.chatId,
                                    content: option,
                                    nonce: crypto.randomUUID(),
                                    serverId: reply.serverId,
                                    thread: { anchorMessageId: reply.anchorMessageId },
                                })
                            }
                            size="sm"
                            variant={index === 0 ? 'primary' : 'secondary'}
                        >
                            {option}
                        </Button>
                    ))}
                </ActionCard.Actions>
            ) : null}
            {canAnswer ? (
                <ActionCard.Meta>
                    {ask.options.length > 0
                        ? 'Or write a reply below.'
                        : 'Write your answer below.'}
                </ActionCard.Meta>
            ) : null}
            {send.error ? (
                <span className="text-danger text-xs" role="alert">
                    {send.error.message}
                </span>
            ) : null}
        </ActionCard>
    );
}
