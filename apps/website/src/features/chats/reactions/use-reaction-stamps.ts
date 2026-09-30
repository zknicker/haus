import * as React from 'react';
import { freshReactions } from '../../../hooks/servers/fresh-reactions.ts';
import type { ReactionPile } from './reaction-pile-model.ts';

export interface ReactionStamp {
    /** Seconds before this sticker starts falling. */
    delay: number;
    /** Restarts the stamp when the same reactor's emoji arrives again. */
    token: number;
}

/** Several live arrivals at once land one after another, this far apart. */
export const stampStaggerSeconds = 0.3;
/** Fade-in plus fall: the stamp's landing frame, where the row thuds. */
export const stampLandSeconds = 0.29;

let nextToken = 0;

/**
 * Which stickers in this pile should stamp in. Only reactions the ledger saw
 * arrive live qualify; everything else renders already at rest.
 */
export function useReactionStamps(
    messageId: string,
    pile: ReactionPile,
    pileRef: React.RefObject<HTMLElement | null>
) {
    const [stamps, setStamps] = React.useState<ReadonlyMap<string, ReactionStamp>>(noStamps);
    const keys = [...pile.stickers, ...pile.overflow].map((sticker) => sticker.key);
    const signature = keys.join('\n');
    const order = pile.stickers.map((sticker) => sticker.key).join('\n');

    // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` and `order` stand in for `keys` and `pile` by value
    React.useLayoutEffect(() => {
        const fresh = freshReactions.observe(messageId, keys, Date.now());
        const pileOrder = order.split('\n');
        const landing = scheduleStamps(pileOrder, fresh);
        setStamps((previous) => {
            // A sticker that leaves the pile forgets its stamp, so it comes
            // back at rest unless it arrives live again.
            const kept = [...previous].filter(([key]) => pileOrder.includes(key));
            if (landing.size === 0 && kept.length === previous.size) {
                return previous;
            }
            const next = new Map(kept);
            for (const [key, delay] of landing) {
                nextToken += 1;
                next.set(key, { delay, token: nextToken });
            }
            return next;
        });
        for (const delay of landing.values()) {
            thud(pileRef.current?.closest('[data-message-id]'), delay + stampLandSeconds);
        }
    }, [messageId, order, signature]);

    return stamps;
}

/**
 * Staggers fresh stickers, by key, in pile order. A reaction hidden behind
 * the "+N" chip has no sticker to stamp.
 */
export function scheduleStamps(
    pileOrder: readonly string[],
    fresh: readonly string[]
): Map<string, number> {
    const landing = new Map<string, number>();
    for (const key of pileOrder) {
        if (fresh.includes(key)) {
            landing.set(key, landing.size * stampStaggerSeconds);
        }
    }
    return landing;
}

const noStamps: ReadonlyMap<string, ReactionStamp> = new Map();

/** The message row dips 2px on the landing frame, like something heavy hit it. */
function thud(row: Element | null | undefined, delaySeconds: number) {
    if (!(row instanceof HTMLElement) || reducedMotion()) {
        return;
    }
    row.animate(
        [
            { transform: 'none' },
            { offset: 0.3, transform: 'translateY(2px)' },
            { offset: 0.6, transform: 'translateY(-1px)' },
            { transform: 'none' },
        ],
        { delay: delaySeconds * 1000, duration: 250, easing: 'ease-out' }
    );
}

function reducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
