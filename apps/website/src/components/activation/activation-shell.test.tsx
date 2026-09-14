import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivationFrame } from './activation-frame.tsx';
import { ActivationLoading } from './activation-loading.tsx';
import { ActivationShell } from './activation-shell.tsx';

test('the persistent frame owns one animated mark even when a scene hides it', () => {
    const markup = renderToStaticMarkup(
        <ActivationFrame>
            <ActivationShell mark={null}>Cove</ActivationShell>
        </ActivationFrame>
    );
    expect(markup).toContain(
        'haus-ghost haus-ghost--iridescent haus-ghost--animated activation-mark'
    );
    expect(markup.match(/class="activation-brand"/gu)).toHaveLength(1);
    expect(markup).not.toContain('haus-app-icon.png');
});

test('opening remains neutral before the portal hosts are attached', () => {
    const markup = renderToStaticMarkup(
        <ActivationFrame>
            <ActivationLoading />
        </ActivationFrame>
    );
    expect(markup).toContain('activation-mark');
    expect(markup).not.toContain('Sign in');
    expect(markup).not.toContain('<h1');
});
