import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeCaptainList } from './computer-agents.tsx';

test('Captains using this device by default are rows with a status chip, model fact, and no data grid', () => {
    const html = renderToStaticMarkup(
        <HomeCaptainList
            onOpenAgent={() => undefined}
            rows={[
                {
                    avatarUrl: null,
                    availability: 'idle',
                    displayName: 'Blippy',
                    id: 'agent-blippy',
                    model: 'GPT-5.6 Sol',
                    wakePause: null,
                },
            ]}
        />
    );

    expect(html).not.toContain('data-slot="data-grid"');
    expect(html).toContain('Blippy');
    expect(html).toContain('GPT-5.6 Sol');
    expect(html).toContain('Online');
    expect(html).toContain('chip--sm');
    expect(html).toContain('data-slot="chip-label"');
    expect(html).toContain('<button');
});

test('a device no Captain uses by default shows one none-yet row', () => {
    const html = renderToStaticMarkup(<HomeCaptainList onOpenAgent={() => undefined} rows={[]} />);

    expect(html).toContain('No Captains use this device by default');
    expect(html).not.toContain('<button');
});
