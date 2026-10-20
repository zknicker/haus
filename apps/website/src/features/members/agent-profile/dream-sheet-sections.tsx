import type { AgentDreamFollowUp } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { ReferenceMarkdown } from '../../mentions/reference-markdown.tsx';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';
import { chatPlace } from '../../shell/tab-identity.ts';
import { formatFollowUpWhen } from './dream-summary-model.ts';

/** What the Agent wrote about the night, in its own voice, rendered as the App renders agent text. */
export function DreamSummaryGroup({ summary }: { summary: string }) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>What I learned</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <div data-selectable-text="">
                <ReferenceMarkdown
                    className="chat-markdown text-foreground text-sm"
                    content={summary}
                />
            </div>
        </ItemCardGroup>
    );
}

/** The reminders the Agent set while dreaming: what, where it was promised, and when it fires. */
export function DreamFollowUpsGroup({
    followUps,
    serverId,
}: {
    followUps: readonly AgentDreamFollowUp[];
    serverId: string;
}) {
    const now = useRelativeNow();
    const chats = useChats(serverId);
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Follow-ups</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {followUps.map((followUp, index) => {
                    const chat = chats.data?.find((entry) => entry.id === followUp.anchorChatId);
                    return (
                        <React.Fragment key={followUp.reminderId}>
                            {index > 0 ? <Separator /> : null}
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>{followUp.title}</ItemCard.Title>
                                    {/* Blank until the Chat list reads; never a placeholder. */}
                                    {chat ? (
                                        <ItemCard.Description>
                                            {chatPlace(chat)}
                                        </ItemCard.Description>
                                    ) : null}
                                </ItemCard.Content>
                                <ItemCard.Action className="min-w-0 shrink">
                                    <SettingsFact className="block truncate text-right tabular-nums">
                                        <time dateTime={followUp.fireAt}>
                                            {formatFollowUpWhen(followUp.fireAt, now)}
                                        </time>
                                    </SettingsFact>
                                </ItemCard.Action>
                            </ItemCard>
                        </React.Fragment>
                    );
                })}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
