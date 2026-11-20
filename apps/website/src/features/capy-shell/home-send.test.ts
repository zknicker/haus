import { expect, test } from 'bun:test';
import { defaultCaptainId, planHomeTask } from './home-send.ts';

const captain = { agentId: 'forge', name: 'Forge' };

test('a Home ask becomes a Task in its Project for its Captain, first line as title', () => {
    expect(
        planHomeTask({
            captain,
            projectChatId: 'cht_eng',
            text: ' Fix composer fonts \nThey fall back to Arial on Windows. ',
        })
    ).toEqual({
        assigneeAgentId: 'forge',
        description: 'They fall back to Arial on Windows.',
        projectId: 'cht_eng',
        title: 'Fix composer fonts',
    });
});

test('a one-line ask has no description, and an empty ask plans nothing', () => {
    expect(planHomeTask({ captain, projectChatId: 'cht_eng', text: 'Ship it' })).toEqual({
        assigneeAgentId: 'forge',
        projectId: 'cht_eng',
        title: 'Ship it',
    });
    expect(planHomeTask({ captain, projectChatId: 'cht_eng', text: ' \n ' })).toBeNull();
});

test('a first line longer than a title keeps the whole ask as the description', () => {
    const long = 'x'.repeat(250);
    const plan = planHomeTask({ captain, projectChatId: 'cht_eng', text: long });
    expect(plan?.title.length).toBe(200);
    expect(plan?.description).toBe(long);
});

test("the Captain defaults to the Project's Captain, else the Server's first", () => {
    expect(defaultCaptainId(['retired', 'cove'], ['forge', 'cove'])).toBe('cove');
    expect(defaultCaptainId([], ['forge', 'cove'])).toBe('forge');
    expect(defaultCaptainId(['cove'], [])).toBeNull();
});
