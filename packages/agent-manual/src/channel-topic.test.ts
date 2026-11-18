import { expect, test } from 'bun:test';
import { getManualTopic, searchManualTopics } from './index.ts';

test('the channel topic teaches Agents to create a channel instead of asking a human to', () => {
    const topic = getManualTopic('channel');
    expect(topic?.body).toContain(
        'haus channel create --name <name> --human @handle [--description <text>]'
    );
    expect(topic?.body).toContain('you do not need a human to do it for you');
    // Visible only to the humans in it, and adding people stays deliberate.
    expect(topic?.body).toContain('A human sees a channel only once they are in it');
    expect(topic?.body).toContain('never add people on a guess');
    // The live miss: alerts set up in the old channel before the new one existed.
    expect(topic?.body).toContain('such as recurring alerts');
    expect(topic?.body).toContain('create it before you set up the reminders, triggers, or posts');
    expect(topic?.body).toContain('haus server info --channels --query <name>');
    expect(topic?.body).not.toMatch(/private/u);
    expect(
        searchManualTopics('create a new channel for alerts', { limit: 5, scope: 'all' }).map(
            ({ id }) => id
        )
    ).toContain('channel');
});
