import { expect, test } from 'bun:test';
import { planHomeTask } from './home-send.ts';

test('a Home ask becomes a Task in its Project, first line as title', () => {
    expect(
        planHomeTask({
            projectChatId: 'cht_eng',
            text: ' Fix composer fonts \nThey fall back to Arial on Windows. ',
        })
    ).toEqual({
        description: 'They fall back to Arial on Windows.',
        projectId: 'cht_eng',
        title: 'Fix composer fonts',
    });
});

test('a one-line ask has no description, and an empty ask plans nothing', () => {
    expect(planHomeTask({ projectChatId: 'cht_eng', text: 'Ship it' })).toEqual({
        projectId: 'cht_eng',
        title: 'Ship it',
    });
    expect(planHomeTask({ projectChatId: 'cht_eng', text: ' \n ' })).toBeNull();
});

test('a first line longer than a title keeps the whole ask as the description', () => {
    const long = 'x'.repeat(250);
    const plan = planHomeTask({ projectChatId: 'cht_eng', text: long });
    expect(plan?.title.length).toBe(200);
    expect(plan?.description).toBe(long);
});
