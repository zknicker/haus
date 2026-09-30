import { Tooltip } from '@heroui/react';
import type * as React from 'react';
import { Button } from 'react-aria-components';
import {
    type ReactionSticker as ReactionStickerModel,
    stickerPose,
    stickerSeed,
} from './reaction-pile-model.ts';
import { ReactorFace, useReactors } from './reactor-identity.tsx';
import { StickerBurst } from './sticker-burst.tsx';
import type { ReactionStamp } from './use-reaction-stamps.ts';

/**
 * One die-cut emoji sticker. Drawn at Apple's 160px emoji bitmap size and
 * scaled down so the outline filter works at full resolution and the glyph
 * never upscales. Pressing toggles the viewer's own reaction, as the pills
 * did; hovering or focusing shows who stuck it. Each reactor gets their own
 * sticker, so two people's 👍 are two stickers.
 */
export function ReactionSticker({
    index,
    messageId,
    onToggle,
    stamp,
    sticker,
}: {
    index: number;
    messageId: string;
    onToggle?: () => void;
    stamp?: ReactionStamp;
    sticker: ReactionStickerModel;
}) {
    const reactor = useReactors()(sticker.actor);
    const pose = stickerPose(messageId, sticker);

    return (
        <Tooltip closeDelay={0} delay={0}>
            <Button
                aria-label={`${sticker.emoji} from ${reactor.name}`}
                aria-pressed={onToggle ? sticker.own : undefined}
                className="reaction-sticker"
                data-stamping={stamp ? '' : undefined}
                onPress={onToggle}
                style={
                    {
                        '--d': `${stamp?.delay ?? 0}s`,
                        '--i': index,
                        '--jy': `${pose.jitter}px`,
                        '--tilt': `${pose.tilt}deg`,
                    } as React.CSSProperties
                }
            >
                {stamp ? (
                    <StickerBurst key={stamp.token} seed={stickerSeed(messageId, sticker)} />
                ) : null}
                <span aria-hidden="true" className="reaction-sticker__glyph" key={stamp?.token}>
                    <span className="reaction-sticker__emoji">{sticker.emoji}</span>
                </span>
            </Button>
            <Tooltip.Content showArrow>
                <Tooltip.Arrow />
                <span className="flex items-center gap-1.5">
                    <ReactorFace reactor={reactor} />
                    <span className="font-medium">{reactor.name}</span>
                </span>
            </Tooltip.Content>
        </Tooltip>
    );
}
