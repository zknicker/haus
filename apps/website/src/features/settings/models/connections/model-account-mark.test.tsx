import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelAccountLogo, ModelAccountMark } from './model-account-mark.tsx';

function sources(html: string) {
    return [...html.matchAll(/src="([^"]+)"/gu)].map((match) => match[1]);
}

test('each provider and runtime draws the company logo Haus already uses', () => {
    expect(sources(renderToStaticMarkup(<ModelAccountMark account="claude" />))).toEqual([
        'https://svgl.app/library/anthropic_black.svg',
        'https://svgl.app/library/anthropic_white.svg',
    ]);
    expect(sources(renderToStaticMarkup(<ModelAccountMark account="chatgpt" />))).toEqual([
        'https://svgl.app/library/openai.svg',
        'https://svgl.app/library/openai_dark.svg',
    ]);
    expect(sources(renderToStaticMarkup(<ModelAccountMark account="gemini" />))).toEqual([
        'https://svgl.app/library/gemini.svg',
    ]);
    expect(sources(renderToStaticMarkup(<ModelAccountMark account="openrouter" />))).toEqual([
        'https://svgl.app/library/openrouter_light.svg',
        'https://svgl.app/library/openrouter_dark.svg',
    ]);
    expect(sources(renderToStaticMarkup(<ModelAccountMark account="grok-build" />))).toEqual([
        'https://svgl.app/library/xai_light.svg',
        'https://svgl.app/library/xai_dark.svg',
    ]);
    expect(sources(renderToStaticMarkup(<ModelAccountMark account="codex" />))).toEqual([
        'https://svgl.app/library/openai.svg',
        'https://svgl.app/library/openai_dark.svg',
    ]);
});

test('the tile pairs its radius with its 32px box', () => {
    expect(renderToStaticMarkup(<ModelAccountMark account="xai" />)).toContain(
        'border-radius:calc(var(--radius) * 2);height:32px;width:32px'
    );
});

test('the menu logo is the same company logo, bare at 16px', () => {
    const html = renderToStaticMarkup(<ModelAccountLogo account="gemini" />);
    expect(sources(html)).toEqual(['https://svgl.app/library/gemini.svg']);
    expect(html).toContain('size-4 bg-transparent');
});
