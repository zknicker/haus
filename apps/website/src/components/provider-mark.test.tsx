import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProviderMark, type ProviderMarkId } from './provider-mark.tsx';

test('renders provider marks as bare glyphs that inherit their surface color', () => {
    const providers: ProviderMarkId[] = ['codex', 'claude-code', 'grok-build', 'openrouter'];

    for (const provider of providers) {
        const markup = renderToStaticMarkup(<ProviderMark provider={provider} />);

        // Marks must never hardcode a color: white glyphs disappeared entirely
        // on the light-theme Computers cards.
        expect(markup).not.toMatch(/(?:fill|text)-white/);
        expect(markup).not.toContain('background');
        expect(markup).not.toContain('<img');
    }
});
