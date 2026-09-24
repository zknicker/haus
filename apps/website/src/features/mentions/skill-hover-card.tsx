import * as React from 'react';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import type { MentionAppearance } from './mention-appearance.tsx';
import {
    ReferencePreviewHeader,
    ReferencePreviewMark,
    ReferencePreviewText,
} from './reference-preview-header.tsx';
import { useSkillReferenceDescription } from './use-skill-reference-description.ts';

export function SkillHoverCard({
    appearance,
    chatId,
    children,
    displayLabel,
    metadata,
    serverId,
    skillId,
}: {
    appearance: MentionAppearance;
    chatId?: string;
    children: React.ReactNode;
    displayLabel: string;
    metadata?: Record<string, unknown>;
    serverId?: string;
    skillId: string;
}) {
    const fallbackDescription = readDescription(metadata);

    if (!(chatId && serverId)) {
        return (
            <SkillHoverCardFrame
                appearance={appearance}
                description={fallbackDescription}
                displayLabel={displayLabel}
            >
                {children}
            </SkillHoverCardFrame>
        );
    }

    return (
        <LiveSkillHoverCard
            appearance={appearance}
            chatId={chatId}
            displayLabel={displayLabel}
            fallbackDescription={fallbackDescription}
            serverId={serverId}
            skillId={skillId}
        >
            {children}
        </LiveSkillHoverCard>
    );
}

function LiveSkillHoverCard({
    appearance,
    chatId,
    children,
    displayLabel,
    fallbackDescription,
    serverId,
    skillId,
}: {
    appearance: MentionAppearance;
    chatId: string;
    children: React.ReactNode;
    displayLabel: string;
    fallbackDescription: string | null;
    serverId: string;
    skillId: string;
}) {
    const [open, setOpen] = React.useState(false);
    const liveDescription = useSkillReferenceDescription({
        chatId,
        enabled: open,
        serverId,
        skillId,
    });
    const description = liveDescription ?? fallbackDescription;

    return (
        <SkillHoverCardFrame
            appearance={appearance}
            description={description}
            displayLabel={displayLabel}
            onOpenChange={setOpen}
        >
            {children}
        </SkillHoverCardFrame>
    );
}

function SkillHoverCardFrame({
    appearance,
    children,
    description,
    displayLabel,
    onOpenChange,
}: {
    appearance: MentionAppearance;
    children: React.ReactNode;
    description: string | null;
    displayLabel: string;
    onOpenChange?: (open: boolean) => void;
}) {
    return (
        <CursorHoverCard
            className="w-fit max-w-72"
            content={
                <SkillHoverCardContent
                    appearance={appearance}
                    description={description}
                    displayLabel={displayLabel}
                />
            }
            onOpenChange={onOpenChange}
        >
            {children}
        </CursorHoverCard>
    );
}

export function SkillHoverCardContent({
    appearance,
    description,
    displayLabel,
}: {
    appearance: MentionAppearance;
    description: string | null;
    displayLabel: string;
}) {
    return (
        <ReferencePreviewHeader
            mark={
                <ReferencePreviewMark
                    appearance={appearance}
                    className="size-[16px] text-skill-reference"
                />
            }
            meta="Skill"
            title={displayLabel}
        >
            {description ? <ReferencePreviewText>{description}</ReferencePreviewText> : null}
        </ReferencePreviewHeader>
    );
}

function readDescription(metadata: Record<string, unknown> | undefined) {
    const value = metadata?.description;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
