import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GitSettings } from './page.tsx';

test('Git states how Captains and Workers sign their work, with nothing to change', () => {
    const html = renderToStaticMarkup(<GitSettings />);

    expect(html).toContain('Captains');
    expect(html).toContain('Haus bot');
    expect(html).toContain('Whoever asked');
    expect(html).toContain('haus/');
    expect(html).toContain('Workers');
    expect(html).toContain('The device’s git login');
    expect(html).not.toMatch(/<input|role="switch"|data-slot="select"/u);
});
