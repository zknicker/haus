import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModeField } from './mode-row.tsx';

const noop = () => undefined;

describe('mode setting', () => {
    test('offers System, Light and Dark tiles and selects the stored preference', () => {
        const markup = renderToStaticMarkup(
            <ModeField colorTheme="nord" forcedTheme={null} onChange={noop} theme="light" />
        );
        expect(tileLabels(markup)).toEqual(['System', 'Light', 'Dark']);
        expect(selectedValue(markup)).toBe('light');
        expect(markup).not.toContain('data-disabled="true"');
    });

    test('previews each tile in the live theme, System as both modes', () => {
        const markup = renderToStaticMarkup(
            <ModeField colorTheme="nord" forcedTheme={null} onChange={noop} theme="system" />
        );
        expect(previewModes(markup, 'nord')).toEqual(['light', 'dark', 'light', 'dark']);
    });

    test('a pinned mode shows that mode, disabled, over the stored preference', () => {
        const markup = renderToStaticMarkup(
            <ModeField colorTheme="halloween" forcedTheme="dark" onChange={noop} theme="light" />
        );
        expect(selectedValue(markup)).toBe('dark');
        expect(markup).toContain('data-disabled="true"');
        expect(previewModes(markup, 'halloween')).toEqual([]);
    });
});

function tileLabels(markup: string) {
    return [...markup.matchAll(/data-slot="label">([^<]+)</gu)].map((match) => match[1]);
}

function selectedValue(markup: string) {
    return markup.match(
        /data-slot="radio-button-group-item"[^>]*data-selected="true"[^>]*>.*?value="(\w+)"/u
    )?.[1];
}

function previewModes(markup: string, theme: string) {
    return [
        ...markup.matchAll(new RegExp(`data-color-theme="${theme}"[^>]*data-theme="(\\w+)"`, 'gu')),
    ].map((match) => match[1]);
}
