import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComputerAgentGrid } from './computer-agents.tsx';

test('Computer Agents render as a HeroUI Pro data grid', () => {
    const html = renderToStaticMarkup(
        <ComputerAgentGrid
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
            state={{ status: 'ready' }}
        />
    );

    expect(html).toContain('data-slot="data-grid"');
    expect(html).toContain('aria-label="Captains on this device"');
    expect(html).toContain('Captain');
    expect(html).not.toContain('Runtime');
    expect(html).toContain('Model');
    expect(html).toContain('Status');
    expect(html).toContain('Blippy');
    expect(html).toContain('GPT-5.6 Sol');
    expect(html).toContain('Online');
    expect(html).toContain('chip--lg');
    expect(html).not.toContain('min-h-64');
});

test('Computer Agents keep the data grid shell when empty', () => {
    const html = renderToStaticMarkup(
        <ComputerAgentGrid onOpenAgent={() => undefined} rows={[]} state={{ status: 'ready' }} />
    );

    expect(html).toContain('data-slot="data-grid"');
    expect(html).toContain('Captain');
    expect(html).not.toContain('Runtime');
    expect(html).toContain('Model');
    expect(html).toContain('Status');
    expect(html).toContain('data-slot="empty-state"');
    expect(html).toContain('min-h-64');
    expect(html).toContain('No Captains assigned');
});

test('Computer Agents show a loading state before first data', () => {
    const html = renderToStaticMarkup(
        <ComputerAgentGrid onOpenAgent={() => undefined} rows={[]} state={{ status: 'loading' }} />
    );

    expect(html).toContain('Loading Captains');
    expect(html).toContain('min-h-64');
    expect(html).not.toContain('No Captains assigned');
});

test('Computer Agents distinguish an unavailable directory from an empty one', () => {
    const html = renderToStaticMarkup(
        <ComputerAgentGrid
            onOpenAgent={() => undefined}
            rows={[]}
            state={{ onRetry: () => undefined, status: 'unavailable' }}
        />
    );

    expect(html).toContain('Captains unavailable');
    expect(html).toContain('min-h-64');
    expect(html).toContain('Try again');
    expect(html).not.toContain('No Captains assigned');
});
