import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sparkline } from './sparkline.tsx';

test('a series draws one point per value inside the box it was given', () => {
    const markup = renderToStaticMarkup(
        <Sparkline height={14} values={[0, 1, 0, 3, 2, 0, 1]} width={40} />
    );

    expect(markup).toContain('viewBox="0 0 40 14"');
    // One move and six lines: the seven days of the window, in order.
    expect(strokePath(markup).match(/[ML]/gu) ?? []).toHaveLength(7);
});

test('a peak reaches the top of the box and a zero day rests on its floor', () => {
    const markup = renderToStaticMarkup(<Sparkline height={14} values={[0, 4]} width={40} />);

    expect(markup).toContain('M1.50 12.50');
    expect(markup).toContain('L38.50 1.50');
});

test('a week with no turns is a flat baseline, not an invented curve', () => {
    const markup = renderToStaticMarkup(
        <Sparkline height={14} values={[0, 0, 0, 0, 0, 0, 0]} width={40} />
    );

    expect(strokePath(markup)).toBe(
        'M1.50 12.50 L7.67 12.50 L13.83 12.50 L20.00 12.50 L26.17 12.50 L32.33 12.50 L38.50 12.50'
    );
    // No volume to fill and no newest point to mark: the quiet week says so by
    // being one thin rule rather than by borrowing an active pill's shape.
    expect(markup).not.toContain('<circle');
    expect(markup).not.toContain('opacity="0.16"');
});

test('a live series pulses its newest point', () => {
    const markup = renderToStaticMarkup(
        <Sparkline height={14} isLive values={[0, 0, 0, 0, 0, 0, 0]} width={40} />
    );

    expect(markup).toContain('motion-safe:animate-pulse');
    expect(markup).toContain('cx="38.5"');
});

test('a series too short to have a shape draws nothing', () => {
    expect(renderToStaticMarkup(<Sparkline values={[]} />)).toBe('');
    expect(renderToStaticMarkup(<Sparkline values={[3]} />)).toBe('');
});

/** The `d` of the stroked line, which is the series itself rather than its fill. */
function strokePath(markup: string): string {
    return /<path d="([^"]+)" fill="none"/u.exec(markup)?.[1] ?? '';
}
