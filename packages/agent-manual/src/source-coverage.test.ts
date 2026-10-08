import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import sourceManifest from '../../../specs/raft-alignment/manual-source.json';
import {
    getManualTopic,
    type ManualDeliveryTier,
    type ManualRecipeClass,
    manualTopics,
} from './index.ts';

const captureRoot = new URL('../../../specs/raft-alignment/raft-recipes/', import.meta.url);
const relatedAdditions = new Map([
    ['recipes/archetype/patrol', ['recipes/technique/trigger-webhook']],
    ['recipes/technique/reminder-cron', ['recipes/technique/trigger-webhook']],
]);

interface SourceMetadata {
    class: ManualRecipeClass | 'index';
    doc_id: string;
    evidence: 'verified';
    industries: string | string[];
    prereqs: string[];
    related?: string[];
    tier: ManualDeliveryTier;
    title: string;
    triggers: string[];
}

async function readSource(file: (typeof sourceManifest.files)[number]) {
    const bytes = await Bun.file(new URL(file.captureFile, captureRoot)).arrayBuffer();
    expect(createHash('sha256').update(Buffer.from(bytes)).digest('hex')).toBe(file.sha256);
    const text = new TextDecoder().decode(bytes);
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/u)?.[1];
    expect(frontmatter).toBeDefined();
    // Upstream uses unquoted scalar colons in these fields. Read their literal intent
    // while retaining and hashing the original source bytes unchanged.
    const normalized = (frontmatter ?? '')
        .replace(
            /^industries: (?!\[)(.*)$/gmu,
            (_, value: string) => `industries: ${JSON.stringify(value)}`
        )
        .replace(
            'prereqs: [access to the thing being changed — for software: repo + dev runner]',
            `prereqs: [${JSON.stringify('access to the thing being changed — for software: repo + dev runner')}]`
        );
    return { metadata: Bun.YAML.parse(normalized) as SourceMetadata, text };
}

test('pinned source inventory accounts for every card, omission and Haus addition', async () => {
    const sourceIds: string[] = [];
    let seeded = 0;
    for (const file of sourceManifest.files) {
        const { metadata } = await readSource(file);
        if (metadata.class === 'index') {
            continue;
        }
        sourceIds.push(metadata.doc_id);
        seeded += Number(metadata.tier === 'seeded');
        if (sourceManifest.omittedRecipeIds.includes(metadata.doc_id)) {
            expect(getManualTopic(metadata.doc_id)).toBeNull();
            continue;
        }
        const topic = getManualTopic(metadata.doc_id);
        expect(topic?.kind).toBe('recipe');
        if (topic?.kind !== 'recipe') {
            throw new Error(`Missing source recipe ${metadata.doc_id}`);
        }
        expect(topic.class).toBe(metadata.class);
        expect(topic.title).toBe(
            topic.id === 'recipes/technique/memory-hygiene'
                ? 'Keep MEMORY.md hot and notes/ current'
                : metadata.title
        );
        expect(topic.tier).toBe(metadata.tier);
        expect(topic.evidence).toBe(metadata.evidence);
        if (topic.id === 'recipes/technique/memory-hygiene') {
            expect(topic.triggers).toEqual([
                'my MEMORY.md is bloating or over its size limit',
                'where should this preference or fact live in memory',
                'someone gave me feedback to remember as a standing preference',
                'Active Context reads like a diary',
                'about to append a log entry or work log to notes',
                'closed work still looks active',
                'future me needs to recover after compaction',
                'I keep resuming from stale facts',
            ]);
        } else {
            expect(topic.triggers).toEqual(metadata.triggers);
        }
        expect(topic.prereqs).toEqual(metadata.prereqs);
        expect(topic.industries).toEqual(
            Array.isArray(metadata.industries) ? metadata.industries : [metadata.industries]
        );
        expect(topic.related).toEqual([
            ...(metadata.related ?? []).map((id) => `recipes/${id}`),
            ...(relatedAdditions.get(topic.id) ?? []),
        ]);
    }
    expect(sourceIds).toHaveLength(33);
    expect(seeded).toBe(13);
    expect(
        manualTopics
            .filter((topic) => topic.kind === 'recipe')
            .map((topic) => topic.id)
            .sort()
    ).toEqual(
        [
            ...sourceIds.filter((id) => !sourceManifest.omittedRecipeIds.includes(id)),
            ...sourceManifest.hausNativeRecipeIds,
        ].sort()
    );
    for (const id of sourceManifest.hausNativeRecipeIds) {
        expect(sourceIds).not.toContain(id);
    }
});

test('both source navigation maps enumerate the complete source discovery tiers', async () => {
    const sourceRecipes: SourceMetadata[] = [];
    for (const file of sourceManifest.files.filter(
        (file) => !file.captureFile.startsWith('navigation--')
    )) {
        sourceRecipes.push((await readSource(file)).metadata);
    }
    for (const file of sourceManifest.files.filter((file) =>
        file.captureFile.startsWith('navigation--')
    )) {
        const { metadata, text } = await readSource(file);
        const expected = sourceRecipes.filter(
            (recipe) => metadata.doc_id === 'recipes/index' || recipe.tier === 'seeded'
        );
        for (const recipe of expected) {
            expect(text).toContain(recipe.doc_id.replace('recipes/', ''));
        }
    }
});

test('restored recipes preserve ownership, recovery and quiet-watch boundaries', () => {
    const claim = getManualTopic('recipes/technique/task-claim-lock')?.body ?? '';
    expect(claim).toContain('A failed claim is a lock, not a ruling on who owns the lane.');
    expect(claim).toContain('Do not repeat QA or investigation');
    expect(claim).toContain('Treating metadata as ownership truth');
    expect(claim).toContain('Silent retreat');
    expect(claim).toContain('inline reply where the request arrived');
    const recovery = getManualTopic('recipes/pattern/recurring-recovery')?.body ?? '';
    expect(recovery).toContain('Fire that never happened');
    expect(recovery).toContain('haus reminder list');
    expect(recovery).toContain('A quiet check may correctly post nothing');
    expect(recovery).toContain(
        'If a required outcome is missing, or a quiet check has no execution evidence'
    );
    expect(recovery).not.toContain("If the post/artifact isn't there, backfill");
    expect(recovery).not.toContain('delivery retry exhausted at fire_request');
    expect(recovery).not.toContain('about 20 minutes');
    expect(getManualTopic('recipes/archetype/patrol')?.body).toContain(
        'stay silent for unchanged gaps'
    );
    expect(getManualTopic('recipes/technique/reminder-cron')?.body).toContain(
        'unless the reporting agreement requires silence for unchanged or healthy state'
    );
});
