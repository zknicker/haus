import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageGenerationCard } from './image-generation-card.tsx';
import { failedResult, imageGenerationFixture } from './image-generation-fixture.ts';

function render(generation = imageGenerationFixture(), layout: 'solo' | 'strip' = 'solo'): string {
    return renderToStaticMarkup(
        <ImageGenerationCard
            generation={generation}
            layout={layout}
            onOpen={() => undefined}
            serverId="srv_1"
        />
    );
}

test('a generating card reserves the requested aspect and shows model and elapsed time', () => {
    const html = render(imageGenerationFixture({ result: { state: 'generating' } }));
    expect(html).toContain('data-state="generating"');
    expect(html).toContain('--ar:1.7777');
    expect(html).toContain('GPT Image 2.5 Sunburst');
    expect(html).toContain('generating');
    expect(html).not.toContain('<button');
});

test('a pending card renders like a generating one', () => {
    expect(render(imageGenerationFixture({ result: { state: 'pending' } }))).toContain(
        'data-state="pending"'
    );
});

test('a failed card states the reason in the body and no charge in the footer', () => {
    const html = render(imageGenerationFixture({ result: failedResult }));
    expect(html).toContain('data-state="failed"');
    expect(html).toContain('The provider declined this prompt.');
    expect(html).toContain('no charge');
    expect(html).not.toContain('<img');
});

test('a lone card is bounded by max width, a strip card clamps its width from its aspect', () => {
    expect(render(imageGenerationFixture(), 'solo')).toContain('w-[min(100%,22rem');
    const strip = render(imageGenerationFixture(), 'strip');
    expect(strip).toContain('w-[clamp(8.5rem');
    expect(strip).toContain('snap-start');
});
