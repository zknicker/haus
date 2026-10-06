import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournalTool } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTraceImagePreview } from './turn-trace-image.tsx';
import { classifyTraceTool } from './turn-trace-tool-model.ts';

function tool(overrides: Partial<AgentExecutionJournalTool>): AgentExecutionJournalTool {
    return {
        endedAt: '2026-10-06T13:05:04.000Z',
        startedAt: '2026-10-06T13:05:01.000Z',
        status: 'completed',
        toolCallId: 'call-image',
        toolName: 'image_gen',
        ...overrides,
    };
}

/** The row's label, then what the step shows beneath it with no workspace to read from. */
function render(source: AgentExecutionJournalTool) {
    const tool = classifyTraceTool(source);
    assert.ok(tool.image);
    return `${tool.label}\n${renderToStaticMarkup(<TurnTraceImagePreview image={tool.image} />)}`;
}

test('a Codex image generation reads as one and, unpreviewed, names its workspace copy and prompt', () => {
    // What Computer journals for codex-acp's "Image generation" call.
    const markup = render(
        tool({
            input: { id: 'exec-4df6' },
            output: {
                path: 'generated-images/20261006-130501-exec-4df6.png',
                revisedPrompt: 'A red circle on white.',
                savedPath: '/agents/a/home/.codex/generated_images/t/exec-4df6.png',
            },
        })
    );

    assert.match(markup, /Generated an image/);
    assert.match(
        markup,
        /20261006-130501-exec-4df6\.png<\/span><span class="min-w-0 truncate text-muted">generated-images</
    );
    assert.doesNotMatch(markup, /<img/);
    assert.match(markup, /A red circle on white\./);
    assert.doesNotMatch(markup, /Used image_gen|\.codex\/generated_images/);
});

test('Grok Build edits and videos read as what they made', () => {
    const edit = render(
        tool({
            input: { image: ['/agents/a/home/.grok/1.jpg'], prompt: 'Make the circle blue.' },
            output: {
                path: 'generated-images/20261006-130501-2.jpg',
                savedPath: '/agents/a/home/.grok/sessions/s/images/2.jpg',
            },
            toolName: 'image_edit',
        })
    );
    const video = render(
        tool({
            input: { image: '/agents/a/x.png', prompt: 'Spin it.' },
            output: { path: '/agents/a/home/.grok/sessions/s/videos/1.mp4' },
            toolName: 'image_to_video',
        })
    );

    assert.match(edit, /Edited an image/);
    assert.match(edit, /20261006-130501-2\.jpg/);
    assert.match(edit, /Make the circle blue\./);
    assert.match(video, /Made a video/);
    assert.match(video, /1\.mp4<\/span><span class="min-w-0 truncate text-muted">[^<]*videos</);
});
