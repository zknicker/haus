import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComputerAgentGrid, ComputerAgentsEmpty } from './computer-agents.tsx';

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

test('an empty device shows one stock row, not an empty table', () => {
    const html = renderToStaticMarkup(<ComputerAgentsEmpty state={{ status: 'ready' }} />);

    expect(html).not.toContain('data-slot="data-grid"');
    expect(html).toContain('No Captains on this device');
});

test('Computer Agents stay blank before first data', () => {
    const html = renderToStaticMarkup(<ComputerAgentsEmpty state={{ status: 'loading' }} />);

    expect(html).toContain('Loading Captains');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('No Captains on this device');
});

test('Computer Agents distinguish an unavailable directory from an empty one', () => {
    const html = renderToStaticMarkup(
        <ComputerAgentsEmpty state={{ onRetry: () => undefined, status: 'unavailable' }} />
    );

    expect(html).toContain('Captains unavailable');
    expect(html).toContain('Retry');
    expect(html).not.toContain('No Captains on this device');
});
