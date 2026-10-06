import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTraceImageViewer, TurnTraceImageViewerContent } from './turn-trace-image-viewer.tsx';
import type { TurnTraceImage } from './turn-trace-tool-model.ts';

const image: TurnTraceImage = {
    file: {
        dir: 'generated-images',
        name: 'red-circle.png',
        path: 'generated-images/red-circle.png',
    },
    media: 'image',
    prompt: 'A red circle on white.',
    workspacePath: 'generated-images/red-circle.png',
};
const workspace = { agentId: 'agt_1', serverId: 'srv_1' };
const src = 'data:image/png;base64,AAAA';

test('the preview is one keyboard-reachable button that names what it opens', () => {
    const markup = renderToStaticMarkup(
        <TurnTraceImageViewer
            image={image}
            path="generated-images/red-circle.png"
            src={src}
            workspace={workspace}
        >
            <img alt="preview" height={8} src={src} width={8} />
        </TurnTraceImageViewer>
    );

    const trigger = markup.match(/<div[^>]*modal__trigger[^>]*>/)?.[0] ?? '';
    assert.match(trigger, /role="button"/);
    assert.match(trigger, /tabindex="0"/);
    assert.match(trigger, /aria-label="View red-circle\.png"/);
    // Closed, the dialog is not in the page.
    assert.doesNotMatch(markup, /role="dialog"/);
});

test('the viewer names the file, shows the image and its prompt, and offers no workspace link off desktop', () => {
    const markup = renderToStaticMarkup(
        <TurnTraceImageViewerContent
            image={image}
            name="red-circle.png"
            onOpenInWorkspace={null}
            src={src}
        />
    );

    assert.match(markup, /red-circle\.png<\/h2>|red-circle\.png<\/h3>|>red-circle\.png</);
    assert.match(
        markup,
        /<img[^>]*alt="A red circle on white\."[^>]*src="data:image\/png;base64,AAAA"/
    );
    assert.match(markup, /A red circle on white\./);
    // The web keeps Agent files in the chat's side pane, which the trace cannot reach.
    assert.doesNotMatch(markup, /Open in workspace/);
});

test('on desktop the viewer offers the file as a workspace page', () => {
    const markup = renderToStaticMarkup(
        <TurnTraceImageViewerContent
            image={{ ...image, prompt: null }}
            name="red-circle.png"
            onOpenInWorkspace={() => undefined}
            src={src}
        />
    );

    assert.match(markup, /<button[^>]*>Open in workspace<\/button>/);
    assert.match(markup, /<img[^>]*alt="red-circle\.png"/);
});
