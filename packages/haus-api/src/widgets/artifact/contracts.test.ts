import { describe, expect, test } from 'bun:test';
import { parseWidgetPayload, widgetFallbackText, widgetFenceLabel } from '../contracts.ts';
import { widgetArtifactPropsSchema } from './contracts.ts';

describe('artifact widget contracts', () => {
    test('accepts a workspace-relative html path', () => {
        const props = widgetArtifactPropsSchema.parse({ path: 'workbench/pages/report.html' });

        expect(props).toEqual({ path: 'workbench/pages/report.html' });
        expect(widgetArtifactPropsSchema.safeParse({ path: 'page.htm' }).success).toBe(true);
        expect(widgetArtifactPropsSchema.safeParse({ path: 'PAGE.HTML' }).success).toBe(true);
    });

    test('rejects traversal, absolute, and backslash paths', () => {
        for (const path of [
            '../outside.html',
            'workbench/../../outside.html',
            '/etc/passwd.html',
            'workbench\\page.html',
            './page.html',
            'workbench//page.html',
        ]) {
            expect(widgetArtifactPropsSchema.safeParse({ path }).success).toBe(false);
        }
    });

    test('rejects non-html extensions', () => {
        for (const path of ['page.tsx', 'page.ts', 'page.xhtml', 'page.html.txt', 'notes.md']) {
            expect(widgetArtifactPropsSchema.safeParse({ path }).success).toBe(false);
        }
    });

    test('rejects unknown props, height above all (pane owns sizing)', () => {
        expect(
            widgetArtifactPropsSchema.safeParse({ path: 'a.html', src: 'https://evil.example' })
                .success
        ).toBe(false);
        expect(widgetArtifactPropsSchema.safeParse({ height: 600, path: 'a.html' }).success).toBe(
            false
        );
    });

    test('parseWidgetPayload produces the artifact render envelope', () => {
        const parsed = parseWidgetPayload('artifact', { path: 'workbench/pages/report.html' });

        expect(parsed.name).toBe('artifact');
        expect(parsed.render.component).toBe('haus.widget.artifact');
        expect(parsed.render.target).toBe('chat.inline');
        expect(parsed.fallbackText).toBe('Artifact: workbench/pages/report.html');
    });

    test('fallback text prefers title over the path summary', () => {
        expect(widgetFallbackText('artifact', { path: 'a.html', title: 'Report' })).toBe('Report');
        expect(widgetFallbackText('artifact', {})).toBe('Artifact');
    });

    test('the page tier is authored as a bare page fence, not widget-prefixed', () => {
        expect(widgetFenceLabel('artifact')).toBe('page');
        expect(widgetFenceLabel('visual')).toBe('visual');
    });
});
