import { expect, test } from 'bun:test';
import { planHomeTask } from './home-task-plan.ts';

const captain = { agentId: 'forge', name: 'Forge' };

test('a Home ask becomes a Task input for its Project and Captain, first line as title', () => {
    expect(
        planHomeTask({
            captain,
            projectChatId: 'cht_eng',
            text: ' Fix composer fonts \nThey fall back to Arial on Windows. ',
        })
    ).toEqual({
        input: {
            assigneeAgentId: 'forge',
            description: 'They fall back to Arial on Windows.',
            projectId: 'cht_eng',
            title: 'Fix composer fonts',
        },
        path: 'create-task',
    });
});

test('a one-line ask has no description, and an empty ask plans nothing', () => {
    expect(planHomeTask({ captain, projectChatId: 'cht_eng', text: 'Ship it' })?.input).toEqual({
        assigneeAgentId: 'forge',
        projectId: 'cht_eng',
        title: 'Ship it',
    });
    expect(planHomeTask({ captain, projectChatId: 'cht_eng', text: '  ' })).toBeNull();
});

test('a first line longer than a title keeps the whole ask as the description', () => {
    const long = 'x'.repeat(250);
    const plan = planHomeTask({ captain, projectChatId: 'cht_eng', text: long });
    expect(plan?.input.title.length).toBe(200);
    expect(plan?.input.description).toBe(long);
});
