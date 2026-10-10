import { afterAll, expect, test } from 'bun:test';
import * as React from 'react';
import { installFakeDom } from '../../../test-support/fake-dom.ts';

// A stamped sticker renders its burst and its glyph side by side, both keyed by
// the stamp token. Sharing the bare token made React log "Encountered two
// children with the same key" on every live reaction arrival.

const restoreDom = installFakeDom();
afterAll(() => restoreDom());

const { ReactionSticker } = await import('./reaction-sticker.tsx');
const { createRoot } = await import('react-dom/client');

test('a stamped sticker gives its burst and glyph distinct keys', async () => {
    const errors: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(' '));
    };
    try {
        const container = document.createElement('div');
        const root = createRoot(container);
        await React.act(() =>
            root.render(
                <ReactionSticker
                    index={0}
                    messageId="msg_1"
                    stamp={{ delay: 0, token: 1 }}
                    sticker={{
                        actor: { handle: 'zach', id: 'usr_1', kind: 'human' },
                        emoji: '👍',
                        key: '👍:usr_1',
                        own: false,
                    }}
                />
            )
        );
        // No unmount: React Aria's press cleanup reads `SVGElement`, which the
        // fake DOM lacks. The root dies with the test process.
    } finally {
        console.error = realError;
    }

    expect(errors.filter((line) => line.includes('same key'))).toEqual([]);
});
