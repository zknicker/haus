import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionChipsSection } from './connection-chips-section.tsx';

test('RankWrangler says it adds product chips, beside an inert sample product chip', () => {
    const markup = renderToStaticMarkup(<ConnectionChipsSection preset="rankwrangler" />);

    expect(markup).toContain('In Chat');
    expect(markup).toContain('Product chips');
    expect(markup).toContain(
        'Amazon ASINs and product links in chat become product chips with a preview.'
    );
    expect(markup).toMatch(
        /<span inert="">.*aria-label="Open Pumpkin Patch Tee on Amazon".*reference-chip--product/
    );
});

test('Linear says it adds issue chips, beside an inert sample issue chip', () => {
    const markup = renderToStaticMarkup(<ConnectionChipsSection preset="linear" />);

    expect(markup).toContain('Issue chips');
    expect(markup).toMatch(
        /<span inert="">.*aria-label="Open HAUS-42 Polish the onboarding tour in Linear"/
    );
});

test('a connection that adds no chips has no In Chat section', () => {
    expect(renderToStaticMarkup(<ConnectionChipsSection preset="github" />)).toBe('');
    expect(renderToStaticMarkup(<ConnectionChipsSection preset={null} />)).toBe('');
});
