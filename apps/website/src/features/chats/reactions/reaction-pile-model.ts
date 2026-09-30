import type { ChatMessageReaction } from '@haus/api';
import { reactionKey } from '../../../hooks/servers/fresh-reactions.ts';

export type ReactionActor = ChatMessageReaction['actors'][number];

export interface ReactionSticker {
    actor: ReactionActor;
    emoji: string;
    /** Unique within a pile: one sticker per emoji and reactor. */
    key: string;
    /** Whether the viewer reacted with this emoji, which makes a press remove it. */
    own: boolean;
}

export interface ReactionPile {
    /** Stickers past the first few, behind the "+N" chip. */
    overflow: readonly ReactionSticker[];
    stickers: readonly ReactionSticker[];
}

/** Stickers drawn before the rest collapse into a "+N" chip. */
export const maxPileStickers = 4;
/**
 * Horizontal step between stickers at rest and fanned. At rest a sticker
 * overlaps its neighbour only slightly, so repeated copies of one emoji
 * still read as separate silhouettes.
 */
export const restStep = 19;
export const fanStep = 30;

/**
 * One sticker per reactor per emoji, so two people's 👍 are two stickers.
 * They follow the Server's order: emoji by first arrival, then each emoji's
 * reactors by arrival. The viewer's pending adds join at the end until the
 * Server confirms them.
 */
export function buildReactionPile({
    pending,
    reactions,
    viewerUserId,
}: {
    pending: readonly string[];
    reactions: readonly ChatMessageReaction[];
    viewerUserId?: string;
}): ReactionPile {
    const pairs: { actor: ReactionActor; emoji: string }[] = [];
    const seen = new Set<string>();
    const add = (emoji: string, actor: ReactionActor) => {
        const key = reactionKey(emoji, actor.id);
        if (!seen.has(key)) {
            seen.add(key);
            pairs.push({ actor, emoji });
        }
    };
    for (const reaction of reactions) {
        for (const actor of reaction.actors) {
            add(reaction.emoji, actor);
        }
    }
    if (viewerUserId) {
        for (const emoji of pending) {
            add(emoji, { handle: null, id: viewerUserId, kind: 'human' });
        }
    }

    const ownEmoji = new Set(
        pairs.filter(({ actor }) => actor.id === viewerUserId).map(({ emoji }) => emoji)
    );
    const all = pairs.map(({ actor, emoji }) => ({
        actor,
        emoji,
        key: reactionKey(emoji, actor.id),
        own: ownEmoji.has(emoji),
    }));

    return { overflow: all.slice(maxPileStickers), stickers: all.slice(0, maxPileStickers) };
}

/** How far every sticker leans, in degrees. */
export const stickerLean = 8;

/**
 * A sticker's tilt: exactly ±8°, alternating by its place in the pile, so
 * neighbours' edges part instead of stacking into one shape. Every sticker
 * sits on the same baseline.
 */
export function stickerTilt(index: number) {
    return index % 2 === 0 ? -stickerLean : stickerLean;
}

type StickerIdentity = Pick<ReactionSticker, 'actor' | 'emoji'>;

/** The stable seed for one sticker's landing burst. */
export function stickerSeed(messageId: string, sticker: StickerIdentity) {
    return stableHash(`${messageId}:${sticker.emoji}:${sticker.actor.id}`);
}

/** 32-bit FNV-1a: small, fast, and identical on every render and client. */
export function stableHash(text: string) {
    let hash = 0x81_1c_9d_c5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01_00_01_93);
    }
    return hash >>> 0;
}

/**
 * The pile's resting and fanned widths. The fanned width is also its hover
 * hit area, which widens at once so the cursor never falls into a gap.
 */
export function pileWidths(slots: number) {
    return { fan: slots * fanStep + 18, rest: slots * restStep + 13 };
}
