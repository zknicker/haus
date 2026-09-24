import {
    parseAgentReferenceTarget,
    parseChatReferenceTarget,
    parseSkillReferenceTarget,
} from '@haus/api/rich-references';
import type * as React from 'react';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import { AgentHoverCard } from '../members/agent-hover-card.tsx';
import { ChannelHoverCard } from './channel-hover-card.tsx';
import type { MentionAppearance } from './mention-appearance.tsx';
import type { ReferenceKind } from './mention-types.ts';
import {
    ReferencePreviewHeader,
    ReferencePreviewMark,
    ReferencePreviewText,
} from './reference-preview-header.tsx';
import { SkillHoverCard } from './skill-hover-card.tsx';

export function ReferenceHoverCard({
    appearance,
    chatId: sourceChatId,
    children,
    displayLabel,
    id,
    kind,
    metadata,
    serverId,
}: {
    appearance: MentionAppearance;
    chatId?: string;
    children: React.ReactNode;
    displayLabel: string;
    id: string;
    kind: ReferenceKind;
    metadata?: Record<string, unknown>;
    serverId?: string;
}) {
    const agentId = kind === 'agent' ? parseAgentReferenceTarget(id) : null;
    if (agentId && serverId) {
        return (
            <AgentHoverCard agentId={agentId} agentName={displayLabel} serverId={serverId}>
                {children}
            </AgentHoverCard>
        );
    }

    const chatId = kind === 'chat' ? parseChatReferenceTarget(id) : null;
    if (chatId && serverId) {
        return (
            <ChannelHoverCard
                appearance={appearance}
                chatId={chatId}
                displayLabel={displayLabel}
                serverId={serverId}
            >
                {children}
            </ChannelHoverCard>
        );
    }

    const skillId = kind === 'skill' ? parseSkillReferenceTarget(id) : null;
    if (skillId) {
        return (
            <SkillHoverCard
                appearance={appearance}
                chatId={sourceChatId}
                displayLabel={displayLabel}
                metadata={metadata}
                serverId={serverId}
                skillId={skillId}
            >
                {children}
            </SkillHoverCard>
        );
    }

    if (kind !== 'agent' && kind !== 'chat' && kind !== 'skill') {
        return children;
    }

    return (
        <CursorHoverCard
            className="w-fit max-w-72"
            content={
                <ReferenceHoverCardContent
                    appearance={appearance}
                    displayLabel={displayLabel}
                    kind={kind}
                    metadata={metadata}
                />
            }
        >
            {children}
        </CursorHoverCard>
    );
}

export function ReferenceHoverCardContent({
    appearance,
    displayLabel,
    kind,
    metadata,
}: {
    appearance: MentionAppearance;
    displayLabel: string;
    kind: 'agent' | 'chat' | 'skill';
    metadata?: Record<string, unknown>;
}) {
    const title =
        kind === 'chat' && !displayLabel.startsWith('#') ? `#${displayLabel}` : displayLabel;
    const description = readDescription(metadata);

    return (
        <ReferencePreviewHeader
            mark={
                <ReferencePreviewMark
                    appearance={appearance}
                    className={kind === 'skill' ? 'size-[16px] text-skill-reference' : undefined}
                />
            }
            meta={referenceKindLabel[kind]}
            title={title}
        >
            {description ? <ReferencePreviewText>{description}</ReferencePreviewText> : null}
        </ReferencePreviewHeader>
    );
}

const referenceKindLabel = {
    agent: 'Agent',
    chat: 'Channel',
    skill: 'Skill',
} satisfies Record<'agent' | 'chat' | 'skill', string>;

function readDescription(metadata: Record<string, unknown> | undefined) {
    const value = metadata?.description;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isPreviewReference(kind: ReferenceKind, id: string) {
    if (kind === 'agent') {
        return parseAgentReferenceTarget(id) !== null;
    }
    if (kind === 'chat') {
        return parseChatReferenceTarget(id) !== null;
    }
    if (kind === 'skill') {
        return parseSkillReferenceTarget(id) !== null;
    }
    return false;
}
