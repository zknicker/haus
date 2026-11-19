import { expect, test } from 'bun:test';
import { getManualTopic } from './index.ts';

test('the channel topic tells Agents that people create Projects in the App', () => {
    const topic = getManualTopic('channel');
    expect(topic?.body).toContain(
        'only people create Projects, in the App, so when someone asks you for a new channel or Project, say that they create it there.'
    );
    expect(topic?.body).not.toContain('haus channel create');
    expect(topic?.summary).not.toContain('create a channel');
    expect(topic?.body).not.toMatch(/private/u);
});
