import { describe, expect, test } from 'bun:test';
import { parseWidgetPayload, widgetFallbackText, widgetRenderInputSchema } from './contracts.ts';

describe('Widget contracts', () => {
    test('parseWidgetPayload produces a durable visual render envelope', () => {
        const parsed = parseWidgetPayload('visual', {
            html: '<h2>Weekly sales</h2><svg viewBox="0 0 640 220"></svg>',
            title: 'Weekly sales',
        });

        expect(parsed.name).toBe('visual');
        expect(parsed.fallbackText).toBe('Weekly sales');
        expect(parsed.render.component).toBe('haus.widget.visual');
        expect(parsed.render.target).toBe('chat.inline');
    });

    test('parseWidgetPayload produces a durable artifact render envelope', () => {
        const parsed = parseWidgetPayload('artifact', {
            path: 'workbench/report.html',
        });

        expect(parsed.name).toBe('artifact');
        expect(parsed.fallbackText).toBe('Page: workbench/report.html');
        expect(parsed.render.component).toBe('haus.widget.artifact');
    });

    test('parseWidgetPayload rejects retired catalog widgets', () => {
        expect(() =>
            parseWidgetPayload('bar-chart', {
                data: [{ day: 'Mon', sold: 4 }],
                series: [{ key: 'sold', label: 'Sold' }],
                title: 'Weekly sales',
                xKey: 'day',
            })
        ).toThrow('Unknown widget "bar-chart".');
        expect(() => parseWidgetPayload('table', { columns: ['A'], rows: [] })).toThrow(
            'Unknown widget "table".'
        );
        expect(() => parseWidgetPayload('calendar-event', { title: 'Hamilton' })).toThrow(
            'Unknown widget "calendar-event".'
        );
    });

    test('render input rejects retired stored components', () => {
        const result = widgetRenderInputSchema.safeParse({
            component: 'haus.widget.calendar-event',
            fallback: { text: 'Hamilton' },
            props: { date: '2026-10-04', title: 'Hamilton' },
            target: 'chat.inline',
        });

        expect(result.success).toBe(false);
    });

    test('widget fallback text prefers title, then shape-specific text', () => {
        expect(widgetFallbackText('visual', { title: 'Royalties trend' })).toBe('Royalties trend');
        expect(widgetFallbackText('artifact', { path: 'workbench/memo.html' })).toBe(
            'Page: workbench/memo.html'
        );
    });
});
