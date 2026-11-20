import { expect, test } from 'bun:test';
import { getManualTopic, resolveManualTopic, searchManualTopics } from './index.ts';

test.each([
    'what agents can see',
    'privacy',
    'security',
    'agent not responding',
    'iphone app',
    'mobile app',
    'product help',
])('the common question "%s" leads to the app topic', (query) => {
    expect(resolveManualTopic(query)?.id).toBe('app');
    expect(
        searchManualTopics(query, { limit: 3, scope: 'all' }).map((topic) => topic.id)
    ).toContain('app');
});

test('the index sends common product questions to the app topic', () => {
    expect(getManualTopic('index')?.body).toContain(
        'The app topic also answers common product questions'
    );
    expect(getManualTopic('app')?.summary).toContain('what Agents can see');
});
