import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFoldLabel } from './turn-trace-fold-label.ts';
import type { TurnTraceTool } from './turn-trace-tool-model.ts';

function media(kind: 'image' | 'video', past: string): TurnTraceTool {
    // Only the fields a fold label reads.
    return {
        image: { file: null, media: kind, prompt: null, workspacePath: null },
        labels: { past, present: past },
        target: null,
    } as unknown as TurnTraceTool;
}

test('a media fold names what it made', () => {
    const image = media('image', 'Generated an image');
    const edit = media('image', 'Edited an image');
    const video = media('video', 'Made a video');
    const animated = media('video', 'Animated an image');

    assert.equal(formatFoldLabel('image', [image, edit]).past, 'Generated 2 images');
    assert.equal(formatFoldLabel('image', [video, animated]).past, 'Generated 2 videos');
    assert.equal(formatFoldLabel('image', [image, video]).past, 'Generated 2 images and videos');
    assert.equal(formatFoldLabel('image', [video, video]).past, 'Made a video ×2');
});
