import { expect, test } from 'bun:test';
import {
    cliFamilyTopics,
    getManualTopic,
    manualGetMissGuidance,
    manualSearchMissGuidance,
    manualTopics,
    nearestManualTopics,
    resolveManualTopic,
    searchManualTopics,
} from './index.ts';
import { createManualLookup } from './lookup.ts';
import { lookupKey } from './lookup-text.ts';

const topIds = (query: string, scope: 'all' | 'recipes' = 'all') =>
    searchManualTopics(query, { limit: 5, scope }).map(({ id }) => id);

test('search ranks partial matches instead of requiring every term', () => {
    // Observed misses: both returned "No Manual topics matched" under all-terms search.
    expect(topIds('cloud agent model')[0]).toBe('cloud-agents');
    expect(topIds('cursor')[0]).toBe('cloud-agents');
    expect(topIds('schedule a follow up')).toContain('reminder');
    expect(topIds('upload a file')[0]).toBe('attachment');
});

test('search weights ids, titles, and triggers above body mentions', () => {
    expect(topIds('should I claim this before starting', 'recipes')[0]).toBe(
        'recipes/technique/task-claim-lock'
    );
    expect(topIds('webhook')[0]).toBe('recipes/technique/trigger-webhook');
    // Every topic mentions agents; a one-word family query still finds its own topic first.
    expect(topIds('reminders')[0]).toBe('reminder');
});

test('search keeps a term-coverage floor and recipe scope', () => {
    expect(topIds('merchbase sales tools')).toEqual([]);
    expect(topIds('reminder', 'recipes').every((id) => id.startsWith('recipes/'))).toBe(true);
});

test('the phrase bonus matches whole words, not substrings across words', () => {
    const topic = (id: string, title: string) => ({
        body: '',
        id,
        kind: 'overview' as const,
        related: [],
        summary: 'ask mess',
        title,
    });
    const lookup = createManualLookup([topic('a', 'Task message'), topic('b', 'Ask mess first')]);
    const score = (id: string) =>
        lookup.rank('ask mess', 'all').find(({ topic: candidate }) => candidate.id === id)?.score;
    // a: both terms hit its summary (4 + 4) and no bonus; b: its title (6 + 6) plus the bonus.
    expect(score('a')).toBe(8);
    expect(score('b')).toBe(22);
});

test('search tolerates a one-letter typo in a word the corpus lacks', () => {
    expect(topIds('remindr')).toContain('reminder');
    expect(topIds('attachmnt')[0]).toBe('attachment');
    // Terms under five letters never fuzz.
    expect(topIds('zq')).toEqual([]);
});

test('get resolves normalized ids, titles, plurals, and observed aliases', () => {
    expect(resolveManualTopic('recipes/technique/task-claim-lock')?.id).toBe(
        'recipes/technique/task-claim-lock'
    );
    expect(resolveManualTopic('technique/task-claim-lock')?.id).toBe(
        'recipes/technique/task-claim-lock'
    );
    expect(resolveManualTopic('Cloud Agents')?.id).toBe('cloud-agents');
    expect(resolveManualTopic('cloud_agent')?.id).toBe('cloud-agents');
    expect(resolveManualTopic('cloud agent model')?.id).toBe('cloud-agents');
    expect(resolveManualTopic('cursor')?.id).toBe('cloud-agents');
    expect(resolveManualTopic('merchbase')).toBeNull();
    // Stable-id get stays exact for seeded callers.
    expect(getManualTopic('Cloud Agents')).toBeNull();
});

test('every command family noun resolves to its topic, singular and plural', () => {
    for (const [family, topicId] of Object.entries(cliFamilyTopics)) {
        expect(getManualTopic(topicId)).not.toBeNull();
        if (family === 'manual') {
            continue;
        }
        expect(resolveManualTopic(family)?.id).toBe(topicId);
        expect(resolveManualTopic(`${family}s`)?.id).toBe(topicId);
        expect(getManualTopic(topicId)?.body).toContain(
            family === 'task' ? 'haus task' : `haus ${family}`
        );
    }
});

test('lookup keys never collide across topics', () => {
    const owners = new Map<string, string>();
    for (const topic of manualTopics) {
        const keys = [topic.id, topic.title, ...(topic.aliases ?? [])].map(lookupKey);
        for (const key of new Set(keys)) {
            expect(owners.get(key) ?? topic.id).toBe(topic.id);
            owners.set(key, topic.id);
        }
    }
});

test('a get miss lists the closest topics with matched terms and runnable commands', () => {
    const miss = manualGetMissGuidance('reminder-schedule-repeat');

    expect(miss.message).toBe("Manual topic 'reminder-schedule-repeat' was not found.");
    expect(miss.nextAction).toContain('Closest matches by content:');
    expect(miss.nextAction).toContain(
        '1. reminder — "Reminders" (matched: reminder, schedule, repeat)'
    );
    expect(miss.nextAction).toContain('haus manual get reminder --intent "');
    expect(miss.nextAction).toContain('haus manual search "reminder schedule repeat" --intent "');
    expect(miss.nextAction).toContain('haus manual get index --intent "');
    expect(
        nearestManualTopics('reminder-schedule-repeat', { limit: 3, scope: 'all' })
    ).toHaveLength(3);
});

test('a get miss with no related words still offers search and the index', () => {
    const miss = manualGetMissGuidance('zzqx');

    expect(miss.nextAction).not.toContain('Closest matches');
    expect(miss.nextAction).toContain('haus manual search "zzqx"');
    expect(miss.nextAction).toContain('haus manual get index');
});

test('an empty search suggests nearest topics, a retry, and the index', () => {
    const miss = manualSearchMissGuidance('merchbase sales tools', 'all');

    expect(miss.message).toBe('No Manual topics matched "merchbase sales tools".');
    expect(miss.nextAction).toContain('Closest matches by content:');
    expect(miss.nextAction).toContain('(matched: tool)');
    expect(miss.nextAction).toContain('Retry with different keywords');
    expect(miss.nextAction).toContain('haus manual get index');

    const recipes = manualSearchMissGuidance('reminder "quoted"', 'recipes');
    expect(recipes.message).toBe('No Manual topics matched "reminder "quoted"" among recipes.');
    expect(recipes.nextAction).toContain('haus manual search "reminder quoted" --intent');
});
