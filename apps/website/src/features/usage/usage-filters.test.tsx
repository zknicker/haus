import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveUsageFilters, usageFilterChips } from './usage-filters.tsx';

const settled = {
    agentsPending: false,
    computerLabel: undefined,
    computersPending: false,
    requestedAgentId: null,
    requestedComputerId: null,
    resolvedAgent: false,
    runtimeId: undefined,
};

test('an unresolvable ?agent= is a removable filter, not a silent drop', () => {
    expect(usageFilterChips({ ...settled, requestedAgentId: 'agt_gone' })).toEqual([
        { key: 'agent', label: 'Captain: Unavailable' },
    ]);
});

test('a resolved Agent is the scope picker alone, and a pending roster says nothing yet', () => {
    // The dashboard's own picker already names the selected Agent, so a chip
    // beside it would make one scope read as two filters.
    expect(
        usageFilterChips({ ...settled, requestedAgentId: 'agt_1', resolvedAgent: true })
    ).toEqual([]);
    // Blank while agent.list settles: "Unavailable" is a claim we cannot make.
    expect(
        usageFilterChips({ ...settled, agentsPending: true, requestedAgentId: 'agt_1' })
    ).toEqual([]);
});

test('Computer and runtime chips keep their labels', () => {
    expect(
        usageFilterChips({
            ...settled,
            computerLabel: "Zach's Mac",
            requestedComputerId: 'cmp_1',
            runtimeId: 'claude-code',
        })
    ).toEqual([
        { key: 'computer', label: "Device: Zach's Mac" },
        { key: 'runtime', label: 'Runtime: Claude Code' },
    ]);
    expect(
        usageFilterChips({ ...settled, computersPending: true, requestedComputerId: 'cmp_1' })
    ).toEqual([{ key: 'computer', label: 'Device: Loading…' }]);
});

test('every chip renders as its own remove control', () => {
    const html = renderToStaticMarkup(
        <ActiveUsageFilters
            chips={[
                { key: 'computer', label: 'Computer: Unavailable' },
                { key: 'agent', label: 'Captain: Unavailable' },
            ]}
            onRemove={() => undefined}
        />
    );

    expect(html).toContain('Active usage filters');
    expect(html).toContain('Captain: Unavailable');
    expect(html.match(/<button/g)).toHaveLength(2);
});
