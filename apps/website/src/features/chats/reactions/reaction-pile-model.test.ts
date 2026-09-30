import { describe, expect, test } from 'bun:test';
import type { ChatMessageReaction } from '@haus/api';
import { buildReactionPile, pileWidths, stickerPose } from './reaction-pile-model.ts';
import { scheduleStamps } from './use-reaction-stamps.ts';

const tiny = { handle: 'tiny', id: 'agent-tiny', kind: 'agent' } as const;
const blippy = { handle: 'blippy', id: 'agent-blippy', kind: 'agent' } as const;
const zach = { handle: 'zach', id: 'user-zach', kind: 'human' } as const;

function reaction(emoji: string, ...actors: ChatMessageReaction['actors']): ChatMessageReaction {
    return { actors, emoji };
}

const view = (pile: ReturnType<typeof buildReactionPile>) => ({
    overflow: pile.overflow.map(({ actor, emoji }) => `${emoji} ${actor.handle}`),
    stickers: pile.stickers.map(({ actor, emoji }) => `${emoji} ${actor.handle}`),
});

describe('buildReactionPile', () => {
    test('one sticker per reactor per emoji, in the Server order', () => {
        const pile = buildReactionPile({
            pending: [],
            reactions: [reaction('👍', tiny, blippy), reaction('🔥', zach)],
            viewerUserId: zach.id,
        });

        expect(view(pile).stickers).toEqual(['👍 tiny', '👍 blippy', '🔥 zach']);
        expect(pile.overflow).toEqual([]);
    });

    test('never draws one reactor’s emoji twice', () => {
        const pile = buildReactionPile({
            pending: [],
            reactions: [reaction('👍', tiny), reaction('👍', tiny)],
        });

        expect(view(pile).stickers).toEqual(['👍 tiny']);
    });

    test('past four stickers the rest collapse into overflow, one entry per sticker', () => {
        const pile = buildReactionPile({
            pending: [],
            reactions: [
                reaction('🌮', tiny),
                reaction('👍', tiny, blippy, zach),
                reaction('🍕', zach),
                reaction('🙌', blippy),
            ],
            viewerUserId: zach.id,
        });

        expect(view(pile)).toEqual({
            overflow: ['🍕 zach', '🙌 blippy'],
            stickers: ['🌮 tiny', '👍 tiny', '👍 blippy', '👍 zach'],
        });
    });

    test('every sticker of an emoji the viewer used presses to remove it', () => {
        const pile = buildReactionPile({
            pending: [],
            reactions: [reaction('👍', tiny, zach), reaction('🎉', tiny)],
            viewerUserId: zach.id,
        });

        expect(pile.stickers.map((sticker) => sticker.own)).toEqual([true, true, false]);
    });

    test('a pending own add becomes the viewer’s own sticker at the end', () => {
        const pile = buildReactionPile({
            pending: ['🎉', '💛'],
            reactions: [reaction('🎉', tiny)],
            viewerUserId: zach.id,
        });

        expect(pile.stickers.map(({ actor, emoji }) => `${emoji} ${actor.id}`)).toEqual([
            '🎉 agent-tiny',
            `🎉 ${zach.id}`,
            `💛 ${zach.id}`,
        ]);
    });

    test('a pending add the Server already confirmed adds nothing', () => {
        const pile = buildReactionPile({
            pending: ['👍'],
            reactions: [reaction('👍', zach)],
            viewerUserId: zach.id,
        });

        expect(view(pile).stickers).toEqual(['👍 zach']);
    });
});

describe('stickerPose', () => {
    const sticker = (emoji: string, actor: ChatMessageReaction['actors'][number]) => ({
        actor,
        emoji,
    });

    test('is stable for one reactor’s emoji on one message', () => {
        expect(stickerPose('message-1', sticker('💛', tiny))).toEqual(
            stickerPose('message-1', sticker('💛', tiny))
        );
    });

    test('tilts two reactors’ copies of one emoji differently', () => {
        expect(stickerPose('message-1', sticker('👍', tiny))).not.toEqual(
            stickerPose('message-1', sticker('👍', blippy))
        );
    });

    test('tilts ±5–14° and jitters ±3px', () => {
        for (let index = 0; index < 200; index += 1) {
            const pose = stickerPose(`message-${index}`, sticker(index % 2 ? '🎉' : '👍', tiny));
            expect(Math.abs(pose.tilt)).toBeGreaterThanOrEqual(5);
            expect(Math.abs(pose.tilt)).toBeLessThanOrEqual(14);
            expect(Math.abs(pose.jitter)).toBeLessThanOrEqual(3);
        }
    });
});

describe('pileWidths', () => {
    test('fans to 28px steps from 15px steps, so the hit area always covers the resting pile', () => {
        expect(pileWidths(1)).toEqual({ fan: 46, rest: 28 });
        expect(pileWidths(5)).toEqual({ fan: 158, rest: 88 });
    });
});

describe('scheduleStamps', () => {
    test('staggers fresh stickers 0.3s apart in pile order and skips hidden ones', () => {
        expect([...scheduleStamps(['🌮', '🙋', '🔥'], ['🔥', '🌮', '🍕'])]).toEqual([
            ['🌮', 0],
            ['🔥', 0.3],
        ]);
    });
});
