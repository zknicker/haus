import { expect, test } from 'bun:test';
import { visualsBattery } from './prompts.mjs';
import { selectItems } from './run-config.mjs';

test('every battery item carries a unique slug and a real human ask', () => {
    const slugs = visualsBattery.map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
        expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/u);
    }
    for (const item of visualsBattery) {
        expect(item.ask.trim().length).toBeGreaterThan(0);
        expect(item.prompt.startsWith(item.ask)).toBe(true);
    }
});

test('the six baseline asks are still the first six items, in order', () => {
    expect(visualsBattery.slice(0, 6).map((item) => item.slug)).toEqual([
        'sales-today',
        'week-over-week',
        'top-products',
        'marketplace-share',
        'weekday-pattern',
        'marketplace-map',
    ]);
});

test('the fixture reaches the model as parseable JSON inside every prompt', () => {
    const fence = /```json\n([\s\S]+?)\n```/u.exec(visualsBattery[0].prompt);
    expect(fence).not.toBeNull();
    const sales = JSON.parse(fence![1]);
    expect(sales.series30d.rows).toHaveLength(30);
    for (const item of visualsBattery) {
        expect(item.prompt).toContain(fence![0]);
    }
});

test('--only prefers an exact slug over the slugs that merely contain it', () => {
    const battery = [{ slug: 'sales-today' }, { slug: 'sales-today-net' }];
    expect(selectItems('sales-today', battery)).toEqual([{ slug: 'sales-today' }]);
    expect(selectItems('sales-today-', battery)).toEqual([{ slug: 'sales-today-net' }]);
    expect(selectItems(null, battery)).toEqual(battery);
});
