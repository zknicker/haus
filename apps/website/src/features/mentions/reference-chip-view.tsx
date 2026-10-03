import { Chip } from '@heroui/react';
import type * as React from 'react';
import { getChannelColorStyle } from '../../components/chats/channel-color-options.ts';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import { cn } from '../../lib/utils.ts';
import { getMentionAppearance, MentionAppearanceIcon } from './mention-appearance.tsx';
import { getMentionChipColor } from './mention-chip-color.ts';
import { getMentionDisplayLabel } from './mention-display-label.ts';
import type { ReferenceActivation, ReferenceKind } from './mention-types.ts';
import { ProductReferenceThumbnail } from './product-reference-thumbnail.tsx';
import { isPreviewReference, ReferenceHoverCard } from './reference-hover-card.tsx';

export function ReferenceChipView({
    chatId,
    className,
    id,
    kind,
    label,
    metadata,
    displayLabel = getMentionDisplayLabel({ id, kind, label, metadata }),
    onActivate,
    preview = false,
    previewContent,
    serverId,
}: {
    chatId?: string;
    className?: string;
    displayLabel?: string;
    id: string;
    kind: ReferenceKind;
    label: string;
    metadata?: Record<string, unknown>;
    onActivate?: ReferenceActivation;
    preview?: boolean;
    previewContent?: React.ReactNode;
    serverId?: string;
}) {
    const appearance = getMentionAppearance({ id, kind, label, metadata });
    const activationTarget = { id, kind, label, metadata };
    const previewable = chipHasPreview(preview, previewContent, kind, id);
    const activatable = Boolean(onActivate && (kind === 'agent' || kind === 'chat'));
    const chipColor = getMentionChipColor(kind);
    const chipStyle = referenceChipStyle(appearance, chipColor);
    const chip = (
        <Chip
            className={cn(
                'reference-chip max-w-full whitespace-nowrap align-middle',
                kind === 'chat' && 'reference-chip--channel',
                kind === 'pull-request' && 'reference-chip--pull-request',
                kind === 'skill' && 'reference-chip--skill',
                kind === 'product' && 'reference-chip--product',
                className
            )}
            color={chipColor}
            contentEditable={false}
            size="md"
            style={chipStyle}
            title={previewable || kind === 'product' ? undefined : displayLabel}
            variant="tertiary"
        >
            {kind === 'product' ? (
                <ProductReferenceThumbnail
                    key={appearance.iconDataUrl}
                    pending={metadata?.pending === true}
                    src={appearance.iconDataUrl}
                />
            ) : (
                <MentionAppearanceIcon
                    agentAvatar={appearance.agentAvatar}
                    channelAppearance={appearance.channelAppearance}
                    className={cn(
                        'reference-chip__mark',
                        appearance.agentAvatar
                            ? undefined
                            : cn(
                                  'shrink-0 opacity-90',
                                  kind === 'skill' ? 'size-[16px]' : 'size-[18px]'
                              )
                    )}
                    icon={appearance.icon}
                    iconDataUrl={appearance.iconDataUrl}
                />
            )}
            <Chip.Label className="min-w-0 truncate">{displayLabel}</Chip.Label>
        </Chip>
    );

    if (!(previewable || activatable)) {
        return chip;
    }

    const trigger = (
        <button
            aria-label={`${activatable ? 'Open' : 'Preview'} ${displayLabel}`}
            className="reference-chip-trigger inline-flex max-w-full cursor-(--cursor-interactive) rounded-lg align-middle outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={
                activatable
                    ? () => {
                          onActivate?.(activationTarget);
                      }
                    : undefined
            }
            type="button"
        >
            {chip}
        </button>
    );

    if (previewContent) {
        return (
            <CursorHoverCard className="w-80 max-w-[calc(100vw-24px)]" content={previewContent}>
                {trigger}
            </CursorHoverCard>
        );
    }
    return previewable ? (
        <ReferenceHoverCard
            appearance={appearance}
            chatId={chatId}
            displayLabel={displayLabel}
            id={id}
            kind={kind}
            metadata={metadata}
            serverId={serverId}
        >
            {trigger}
        </ReferenceHoverCard>
    ) : (
        trigger
    );
}

function referenceChipStyle(
    appearance: ReturnType<typeof getMentionAppearance>,
    chipColor: ReturnType<typeof getMentionChipColor>
): (React.CSSProperties & { '--chip-fg'?: string }) | undefined {
    const brandForeground = chipColor === 'default' ? appearance.brandColor : undefined;
    const channelStyle = appearance.channelAppearance
        ? getChannelColorStyle(appearance.channelAppearance.color)
        : undefined;
    if (!(brandForeground || channelStyle)) {
        return undefined;
    }
    return {
        ...channelStyle,
        ...(brandForeground ? { '--chip-fg': brandForeground } : {}),
    };
}

function chipHasPreview(
    preview: boolean,
    content: React.ReactNode,
    kind: ReferenceKind,
    id: string
) {
    return Boolean(content) || (preview && isPreviewReference(kind, id));
}
