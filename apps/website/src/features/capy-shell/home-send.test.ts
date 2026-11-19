import { expect, test } from 'bun:test';
import { defaultCaptainId, planHomeSend } from './home-send.ts';

test('a Home ask posts in the Project channel @mentioning its Captain', () => {
    expect(
        planHomeSend({
            captain: { agentId: 'agent:forge', name: 'Forge' },
            projectChatId: 'eng',
            text: '  Fix the composer fonts on Windows  ',
        })
    ).toEqual({
        chatId: 'eng',
        content: '[@Forge](agent://agent%3Aforge) Fix the composer fonts on Windows',
        draft: {
            attachments: [],
            content: '@Forge Fix the composer fonts on Windows',
            mentions: [
                {
                    end: 6,
                    id: 'agent://agent%3Aforge',
                    kind: 'agent',
                    label: 'Forge',
                    projection: 'agent-reference',
                    start: 0,
                    text: '@Forge',
                },
            ],
        },
        path: 'channel-mention',
    });
});

test('an empty ask sends nothing', () => {
    expect(
        planHomeSend({
            captain: { agentId: 'forge', name: 'Forge' },
            projectChatId: 'eng',
            text: ' \n ',
        })
    ).toBeNull();
});

test("the Captain defaults to the Project's Captain, else the Server's first", () => {
    expect(defaultCaptainId(['retired', 'cove'], ['forge', 'cove'])).toBe('cove');
    expect(defaultCaptainId([], ['forge', 'cove'])).toBe('forge');
    expect(defaultCaptainId(['cove'], [])).toBeNull();
});
