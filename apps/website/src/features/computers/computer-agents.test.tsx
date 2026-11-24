import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeCaptainList } from './computer-agents.tsx';

test('a Captain that is not online shows its state under its name', () => {
    const html = renderToStaticMarkup(
        <HomeCaptainList
            onOpenAgent={() => undefined}
            rows={[
                {
                    avatarUrl: null,
                    availability: 'offline',
                    displayName: 'Tiny',
                    id: 'agent-tiny',
                    model: 'GPT-5.6 Terra',
                    wakePause: null,
                },
            ]}
        />
    );
    expect(html).toContain('Offline');
    expect(html).toContain('data-slot="badge"');
});

test('Captains using this device by default are quiet rows with a model fact, and no data grid', () => {
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
    expect(html).not.toContain('Online');
    expect(html).not.toContain('data-slot="badge"');
    expect(html).toContain('<button');
});

test('a device no Captain uses by default shows one none-yet row', () => {
    const html = renderToStaticMarkup(<HomeCaptainList onOpenAgent={() => undefined} rows={[]} />);

    expect(html).toContain('No Captains use this device by default');
    expect(html).not.toContain('<button');
});
