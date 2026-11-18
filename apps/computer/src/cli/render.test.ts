import { expect, test } from 'bun:test';
import { cliColorsEnabled, createCliRenderer } from './render.ts';

test('plain rendering keeps glyphs and drops ANSI codes', () => {
    const render = createCliRenderer({ colors: false });
    expect(render.ok('done')).toBe('✓ done');
    expect(render.fail('broken')).toBe('✗ broken');
    expect(render.warn('careful')).toBe('● careful');
    expect(render.header({ version: '1.2.3' })).toBe('◆ Haus Computer v1.2.3');
    expect(render.header({ version: '1.2.3' })).not.toContain('\u001B[');
});

test('colored rendering wraps text in ANSI codes', () => {
    const render = createCliRenderer({ colors: true });
    expect(render.ok('done')).toContain('\u001B[32m✓\u001B[0m');
    expect(render.fail('broken')).toContain('\u001B[31m✗\u001B[0m');
    expect(render.heading('Usage')).toBe('\u001B[1mUsage\u001B[0m');
});

test('the banner carries the arch, wordmark, and version', () => {
    const banner = createCliRenderer({ colors: false }).banner({ version: '1.2.3' });
    expect(banner).toContain('╭─◠◠◠─╮');
    expect(banner).toContain('Haus Computer');
    expect(banner).toContain('v1.2.3');
    expect(banner.split('\n')).toHaveLength(2);
});

test('update status lines cover every freshness state', () => {
    const render = createCliRenderer({ colors: false });
    expect(render.updateStatusLine({ kind: 'up-to-date', version: '1.2.3' })).toBe('✓ Up to date');
    expect(
        render.updateStatusLine({
            currentVersion: '1.2.3',
            kind: 'update-available',
            latestVersion: '1.3.0',
        })
    ).toBe('● Update available: v1.3.0 — run haus-computer upgrade');
    expect(render.updateStatusLine({ kind: 'development' })).toContain('Development build');
    expect(render.updateStatusLine({ kind: 'unknown' })).toContain('Update check unavailable');
});

test('color enablement honors NO_COLOR, FORCE_COLOR, and TTY', () => {
    expect(cliColorsEnabled({}, true)).toBe(true);
    expect(cliColorsEnabled({}, false)).toBe(false);
    expect(cliColorsEnabled({ NO_COLOR: '1' }, true)).toBe(false);
    expect(cliColorsEnabled({ FORCE_COLOR: '1' }, false)).toBe(true);
    expect(cliColorsEnabled({ FORCE_COLOR: '0' }, false)).toBe(false);
    expect(cliColorsEnabled({ FORCE_COLOR: '1', NO_COLOR: '1' }, false)).toBe(false);
});
