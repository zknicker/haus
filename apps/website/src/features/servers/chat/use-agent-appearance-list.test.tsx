import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Agent } from '@haus/api';
import * as React from 'react';
import { installFakeDom } from '../../../test-support/fake-dom.ts';
import { testAgent } from '../../members/agent-fixtures.ts';
import { useAgentAppearanceList } from './use-agent-appearance-list.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

test('an availability flip keeps the rows agent list; a rendered field change replaces it', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const seen: (readonly Agent[])[] = [];
    function Probe({ agents }: { agents: readonly Agent[] }) {
        seen.push(useAgentAppearanceList(agents));
        return null;
    }
    const root = createRoot(document.createElement('div'));
    const idle = [testAgent({ availability: 'idle', displayName: 'Blippy', id: 'agt_b' })];
    await act(() => root.render(<Probe agents={idle} />));
    await act(() =>
        root.render(<Probe agents={[{ ...(idle[0] as Agent), availability: 'working' }]} />)
    );
    expect(seen.at(-1)).toBe(seen[0]);
    await act(() =>
        root.render(<Probe agents={[{ ...(idle[0] as Agent), displayName: 'Blippy 2' }]} />)
    );
    expect(seen.at(-1)).not.toBe(seen[0]);

    await act(() => root.unmount());
});
