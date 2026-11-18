import { describe, expect, it } from 'bun:test';
import type { MentionOption } from './mention-types.ts';

type InventoryMentionOption = MentionOption;

import { filterMentionOptionsForQuery, selectMentionOptionsForQuery } from './mention-options.ts';

describe('filterMentionOptionsForQuery', () => {
    it('does not render stale broad mention results for a narrower app query', () => {
        const options: MentionOption[] = [
            {
                description: 'Computer use',
                id: 'app://computer-use/Computer%20Use',
                insertText: 'Computer Use',
                kind: 'app',
                label: 'Computer Use',
                projection: 'capability-reference',
                sourceLabel: 'Mac app',
            },
            {
                description: 'Computer use',
                id: 'app://computer-use/Helium',
                insertText: 'Helium',
                kind: 'app',
                label: 'Helium',
                projection: 'capability-reference',
                sourceLabel: 'Mac app',
            },
        ];

        expect(filterMentionOptionsForQuery(options, 'Helium')).toEqual([options[1]]);
    });

    it('filters mention options without matching query case', () => {
        const options: MentionOption[] = [
            {
                description: 'Running in Computer Use',
                id: 'app://computer-use/Helium',
                insertText: 'Helium',
                kind: 'app',
                label: 'Helium',
                projection: 'capability-reference',
                sourceLabel: 'Mac app',
            },
        ];

        expect(filterMentionOptionsForQuery(options, 'Hel')).toEqual(options);
        expect(filterMentionOptionsForQuery(options, 'hel')).toEqual(options);
    });
});

describe('selectMentionOptionsForQuery', () => {
    it('lists agents from the active chat before general inventory', () => {
        const helium = createOption({ label: 'Helium' });

        expect(
            selectMentionOptionsForQuery({
                agents: [
                    {
                        id: 'agent:planner',
                        name: 'Planner',
                    },
                ] as never,
                inventoryData: {
                    options: [helium],
                },
                mentionableAgentIds: ['agent:planner'],
                pathData: undefined,
                query: 'Pla',
            })
        ).toEqual([
            {
                description: 'Agent in this chat',
                id: 'agent://agent%3Aplanner',
                insertText: '@Planner',
                kind: 'agent',
                label: 'Planner',
                projection: 'agent-reference',
                sourceLabel: 'Agents',
            },
        ]);
    });

    it('carries agent appearance into local option metadata', () => {
        const options = selectMentionOptionsForQuery({
            agents: [
                {
                    avatarUrl: '/api/avatars/avt_0123456789abcdef',
                    effectivePrimaryColor: '#2563eb',
                    id: 'agent:planner',
                    name: 'Planner',
                },
            ] as never,
            inventoryData: undefined,
            mentionableAgentIds: ['agent:planner'],
            pathData: undefined,
            query: '',
        });

        expect(options[0]?.metadata).toEqual({
            agentAvatarUrl: '/api/avatars/avt_0123456789abcdef',
            agentColor: '#2563eb',
        });
    });

    it('filters warmed inventory options locally', () => {
        const helium = createOption({ label: 'Helium' });
        const chrome = createOption({ label: 'Chrome' });

        expect(
            selectMentionOptionsForQuery({
                inventoryData: {
                    options: [helium, chrome],
                },
                query: 'Hel',
                pathData: undefined,
            })
        ).toEqual([helium]);
    });

    it('merges path search results with filtered inventory', () => {
        const helium = createOption({ label: 'Helium' });
        const pathOption: InventoryMentionOption = {
            description: 'specs',
            id: '/repo/specs/helium.md',
            insertText: 'specs/helium.md',
            kind: 'file',
            label: 'specs/helium.md',
            projection: 'path-reference',
            sourceLabel: 'File',
        };

        expect(
            selectMentionOptionsForQuery({
                inventoryData: {
                    options: [helium],
                },
                query: 'Hel',
                pathData: {
                    options: [pathOption],
                    query: 'Hel',
                },
            })
        ).toEqual([helium, pathOption]);
    });
});

function createOption(input: { label: string }): InventoryMentionOption {
    return {
        description: 'Computer Use',
        id: `app://computer-use/${encodeURIComponent(input.label)}`,
        insertText: input.label,
        kind: 'app',
        label: input.label,
        projection: 'capability-reference',
        sourceLabel: 'Mac app',
    };
}
