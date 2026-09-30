import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { getShellVariant } from '../../../hooks/shell/use-shell-variant.ts';
import { applyWindowLayout, WindowLayoutField, windowLayoutOptions } from './window-layout-row.tsx';

describe('window layout setting', () => {
    test('is hidden on the web, which has no window layout', () => {
        expect(renderToStaticMarkup(<WindowLayoutField variant={null} />)).toBe('');
    });

    test('renders on desktop', () => {
        expect(renderToStaticMarkup(<WindowLayoutField variant="band" />)).toContain(
            'Window layout'
        );
    });

    test('offers Band and Canvas only', () => {
        expect(windowLayoutOptions.map((option) => [option.id, option.label])).toEqual([
            ['band', 'Band'],
            ['canvas', 'Canvas'],
        ]);
    });

    test('a pick writes the layout, and anything else is ignored', () => {
        applyWindowLayout('canvas');
        expect(getShellVariant()).toBe('canvas');
        applyWindowLayout('current');
        expect(getShellVariant()).toBe('canvas');
        applyWindowLayout('band');
        expect(getShellVariant()).toBe('band');
    });
});
