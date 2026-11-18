import { expect, test } from 'bun:test';
import { selectAddableSkills, selectOutstandingImports } from './agent-skills.tsx';

test('Agent skill picker excludes same-name skills already in the Agent library', () => {
    const addable = selectAddableSkills(
        [
            {
                description: 'Already owned',
                id: 'skl_owned',
                name: 'research',
                source: '~/.agents/skills/research',
            },
            {
                description: 'Can be added',
                id: 'skl_new',
                name: 'writing',
                source: '~/.agents/skills/writing',
            },
        ],
        [
            {
                description: 'Independent Agent copy',
                hash: 'a'.repeat(64),
                modifiedAt: '2026-07-28T20:00:00.000Z',
                name: 'research',
            },
        ]
    );

    expect(addable.map((skill) => skill.name)).toEqual(['writing']);
});

test('Agent profile shows only the latest unresolved import per source', () => {
    const base = {
        agentId: 'agt_1234567890123456',
        requestId: 'req_1234567890123456',
        sourceId: 'hsk_1234567890123456',
        updatedAt: '2026-07-28T20:00:00.000Z',
    };
    expect(
        selectOutstandingImports(
            [
                {
                    ...base,
                    requestId: 'req_3333333333333333',
                    skill: {
                        description: 'Applied',
                        hash: 'a'.repeat(64),
                        modifiedAt: '2026-07-28T20:01:00.000Z',
                        name: 'research',
                    },
                    status: 'applied',
                    updatedAt: '2026-07-28T20:02:00.000Z',
                },
                {
                    ...base,
                    error: 'Old failure',
                    requestId: 'req_2222222222222222',
                    status: 'failed',
                    updatedAt: '2026-07-28T20:01:00.000Z',
                },
            ],
            base.agentId
        )
    ).toEqual([]);
});
