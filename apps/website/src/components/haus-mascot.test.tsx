import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectColorTheme } from '../hooks/shell/use-color-theme.ts';
import { HausMascot } from './haus-mascot.tsx';

const render = () =>
    renderToStaticMarkup(<HausMascot animated aria-hidden="true" fill="iridescent" size={22} />);

describe('Haus mascot', () => {
    afterEach(() => selectColorTheme('default', null));

    test('wears the ghost on the Default theme', () => {
        selectColorTheme('default', null);
        const markup = render();

        expect(markup).toContain('haus-ghost--iridescent');
        expect(markup).not.toContain('haus-ghost--pumpkin');
        expect(markup).not.toContain('haus-ghost__tint');
    });

    test('wears the pumpkin on the Halloween theme, with the same props', () => {
        selectColorTheme('halloween', null);
        const markup = render();

        expect(markup).toContain('haus-ghost--pumpkin');
        expect(markup).toContain('haus-ghost__tint');
        // The call site's props reach the costume untouched.
        expect(markup).toContain('haus-ghost--animated');
        expect(markup).toContain('height:22px');
        expect(markup).not.toContain('<title>');
    });
});
