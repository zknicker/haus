import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GitSettings } from './page.tsx';

test('Git states only what is built today, with nothing to change', () => {
    const html = renderToStaticMarkup(<GitSettings />);

    expect(html).toContain('Captains');
    expect(html).toContain('haus/');
    expect(html).toContain('Coming soon');
    expect(html).not.toContain('Haus bot');
    expect(html).not.toContain('Whoever asked');
    expect(html).toContain('Workers');
    expect(html).toContain('The device’s git login');
    expect(html).not.toMatch(/<input|role="switch"|data-slot="select"/u);
});
