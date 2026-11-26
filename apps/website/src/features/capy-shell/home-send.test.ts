import { expect, test } from 'bun:test';
import { planHomeTask } from './home-send.ts';

const ask = {
    computerId: 'cmp_mini',
    model: 'claude-opus-5-5',
    projectChatId: 'cht_eng',
    requestId: 'req_1',
    serverId: 'srv_haus',
};

test('a Home ask starts a Task in its Project with the prompt as its first message', () => {
    expect(
        planHomeTask({ ...ask, text: ' Fix composer fonts \nThey fall back to Arial. ' })
    ).toEqual({
        computerId: 'cmp_mini',
        model: 'claude-opus-5-5',
        projectId: 'cht_eng',
        prompt: 'Fix composer fonts \nThey fall back to Arial.',
        requestId: 'req_1',
        serverId: 'srv_haus',
    });
});

test('with no Machine picked the Project default applies, and an empty ask plans nothing', () => {
    expect(planHomeTask({ ...ask, computerId: null, text: 'Ship it' })).not.toHaveProperty(
        'computerId'
    );
    expect(planHomeTask({ ...ask, text: ' \n ' })).toBeNull();
});
