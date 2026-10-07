import { expect, test } from 'bun:test';
import {
    agentHtmlSandbox,
    buildVisualSrcDoc,
    clampVisualHeight,
    type VisualColorScheme,
    visualHeights,
} from './frame.ts';
import golden from './frame-golden.json' with { type: 'json' };

// Captured from the App's builder before it moved here: every host must keep
// building this exact document, so any byte change is a deliberate re-capture.
test('builds the same document the App built before the move', () => {
    for (const fixture of golden) {
        expect(
            buildVisualSrcDoc(fixture.html, fixture.tokensCss, fixture.scheme as VisualColorScheme)
        ).toBe(fixture.output);
    }
});

test('the color scheme comes from the caller, not a document', () => {
    expect(buildVisualSrcDoc('<p>x</p>', '', 'light')).toContain(':root { color-scheme: light;');
    expect(buildVisualSrcDoc('<p>x</p>', '', 'dark')).toContain(':root { color-scheme: dark;');
});

test('the sandbox never grants the app origin', () => {
    expect(agentHtmlSandbox).not.toContain('allow-same-origin');
});

test('clamps reported heights into the frame range', () => {
    expect(clampVisualHeight(0)).toBe(visualHeights.min);
    expect(clampVisualHeight(Number.MAX_SAFE_INTEGER)).toBe(visualHeights.max);
    expect(clampVisualHeight(300.4)).toBe(300);
});
