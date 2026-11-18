import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageGenerationCard } from './image-generation-card.tsx';
import { failedResult, imageGenerationFixture } from './image-generation-fixture.ts';

function render(generation = imageGenerationFixture()): string {
    return renderToStaticMarkup(
        <ImageGenerationCard generation={generation} onOpen={() => undefined} serverId="srv_1" />
    );
}

const tileBox = 'h-(--chat-media-tile-height)';

test('a generating card is the media tile box with model and elapsed time', () => {
    const html = render(imageGenerationFixture({ result: { state: 'generating' } }));
    expect(html).toContain('data-state="generating"');
    expect(html).toContain('w-(--chat-media-tile-width)');
    expect(html).toContain(tileBox);
    expect(html).toContain('GPT Image 2.5 Sunburst');
    expect(html).toContain('generating');
    expect(html).not.toContain('<button');
});

test('a pending card renders like a generating one', () => {
    expect(render(imageGenerationFixture({ result: { state: 'pending' } }))).toContain(
        'data-state="pending"'
    );
});

test('a failed card is the same box, quiet, with the reason off the tile', () => {
    const html = render(imageGenerationFixture({ result: failedResult }));
    expect(html).toContain('data-state="failed"');
    expect(html).toContain('w-(--chat-media-tile-width)');
    expect(html).toContain(tileBox);
    expect(html).toContain('Couldn&#x27;t generate: The provider declined this prompt.');
    expect(html).toContain('chip--danger');
    expect(html).toContain('A warm hero image for the launch post.');
    expect(html).toContain('Didn&#x27;t render');
    expect(html).not.toContain('border-dashed');
    expect(html).not.toContain('<img');
});

test('card size never depends on the image aspect', () => {
    const html = render();
    expect(html).not.toContain('--ar');
    expect(html).not.toContain('clamp(');
});

test('only a card for a running job enters, staggered by its place in the Message', () => {
    const live = renderToStaticMarkup(
        <ImageGenerationCard
            generation={imageGenerationFixture({ result: { state: 'generating' } })}
            index={2}
            onOpen={() => undefined}
            serverId="server-1"
        />
    );
    expect(live).toMatch(/class="[^"]*\bbg-nested-surface image-generation-enter\b/u);
    expect(live).toContain('animation-delay:100ms');
    const settled = render(imageGenerationFixture({ result: failedResult }));
    expect(settled).not.toContain('image-generation-enter');
    expect(settled).toContain('bg-nested-surface');
});
