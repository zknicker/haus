import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getManualTopic } from '@haus/agent-manual';
import {
    coveSeededSummaries,
    coveWorkspaceFiles,
    inspectCoveFactoryGuidance,
    reconcileCoveFactoryGuidance,
    seedCoveWorkspace,
    validateCoveWorkspace,
} from './cove-starter-kit.ts';

let workspaceDir = '';

beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haus-cove-workspace-'));
});

afterEach(async () => {
    await fs.rm(workspaceDir, { force: true, recursive: true });
});

test('seeds Cove exact inventory and 12 valid separately authored Manual summaries', async () => {
    const firstManifest = await seedCoveWorkspace(workspaceDir);
    const replayManifest = await seedCoveWorkspace(workspaceDir);

    expect(replayManifest).toBe(firstManifest);
    expect((await fs.readdir(workspaceDir)).sort()).toEqual(['MEMORY.md', 'notes']);
    expect((await fs.readdir(path.join(workspaceDir, 'notes'))).sort()).toEqual([
        'onboarding_knowledge_faq.md',
        'onboarding_objectives.md',
        'onboarding_playbook.md',
    ]);
    expect(coveSeededSummaries.map(([id]) => id)).toEqual([
        'recipes/decision/one-or-many',
        'recipes/decision/stake-strictness',
        'recipes/decision/when-to-ask-human',
        'recipes/pattern/discuss-then-assign',
        'recipes/pattern/evidence-handoff',
        'recipes/pattern/recurring-recovery',
        'recipes/technique/html-artifact-discussion',
        'recipes/technique/preview-env',
        'recipes/technique/reminder-cron',
        'recipes/technique/sent-zero',
        'recipes/technique/task-claim-lock',
        'recipes/technique/video-review',
    ]);
    for (const [id, summary] of coveSeededSummaries) {
        expect(getManualTopic(id)).toMatchObject({ id, kind: 'recipe', tier: 'seeded' });
        expect(summary.length).toBeGreaterThan(40);
    }

    const corpus = await Promise.all(
        coveWorkspaceFiles.map((name) => fs.readFile(path.join(workspaceDir, name), 'utf8'))
    );
    expect(corpus.join('\n')).not.toMatch(
        /integration login|local chat history|save-as-a-skill|haus-agent/iu
    );
    expect(corpus.join('\n')).not.toContain('recipes/playbook/agent-creation');
    expect(corpus.join('\n')).toContain('haus agent create');
    expect(corpus.join('\n')).toContain('Do not announce the Agent before the command returns');
    expect(corpus.join('\n')).toContain('name them by `@handle`');
    // The three creation rules Cove has to carry: where the announcement goes,
    // where the new Agent lives, and the standing brief that replaces a DM.
    expect(corpus.join('\n')).toContain('**Announce it in #all.**');
    expect(corpus.join('\n')).toContain('**Put it where the work is.**');
    expect(corpus.join('\n')).toContain('**Give it a brief.**');
    expect(corpus.join('\n')).toContain('at most 280 characters');
    expect(corpus.join('\n')).not.toContain('haus message send --target dm:@handle');
    expect(corpus.join('\n')).not.toMatch(/Created @handle|Open control/u);
    expect(corpus.join('\n')).toContain(
        'Only ask one blocking question first if the answer is required'
    );
    expect(corpus.join('\n')).toContain('the Agent is created without an avatar');
    expect(corpus.join('\n')).toContain('do not send the owner to Settings');
    expect(corpus.join('\n')).toMatch(
        /real-work[\s\S]*starter-team[\s\S]*workstream-chats[\s\S]*effective-collaboration/u
    );
});

test('preserves the Cindy factory guidance shape with only supported Haus actions', async () => {
    await seedCoveWorkspace(workspaceDir);

    const memory = await fs.readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8');
    const playbook = await fs.readFile(
        path.join(workspaceDir, 'notes', 'onboarding_playbook.md'),
        'utf8'
    );
    const faq = await fs.readFile(
        path.join(workspaceDir, 'notes', 'onboarding_knowledge_faq.md'),
        'utf8'
    );
    const objectives = await fs.readFile(
        path.join(workspaceDir, 'notes', 'onboarding_objectives.md'),
        'utf8'
    );

    for (const heading of [
        '## Role',
        '## Core Goals',
        '## What Haus Is (Practical Definition)',
        '## Decision Principles',
        '## Tone Principles',
        '## Behavioral Invariant',
        '## Knowledge Index',
        '## Success Criteria',
    ]) {
        expect(memory).toContain(heading);
    }
    for (const heading of [
        '## Step 1: Open Practical',
        '## Step 2: Activate or Propose',
        '## Step 3: Route by Intent',
        '### Starter Plan Output',
        '### Capability Boundary Pivot',
        '### Active-Elsewhere Handoff',
        '## Step 4: Progress Setup (Soft Guidance)',
        '## Team-Shape Flexibility Principle',
        '## Step 5: End Every Turn with One Next Step',
        '## Inspiration Stories',
        '## Operational Guardrails',
    ]) {
        expect(playbook).toContain(heading);
    }
    expect(playbook).toContain('Their request in this Chat is the consent');
    expect(playbook).toContain('let an Owner or Admin perform the mutation in Haus App');
    expect(faq.match(/^## /gmu)).toHaveLength(15);
    expect(faq).toContain('How do I create Agents or Chats?');
    expect(objectives).toContain(
        'Status values are exactly: `todo`, `done`, `skipped`, `later`, `blocked`'
    );
});

test('refuses to acknowledge an extra file nested inside the factory tree', async () => {
    await seedCoveWorkspace(workspaceDir);
    await fs.writeFile(path.join(workspaceDir, 'notes', 'recipe.md'), '# unsupported\n');
    await expect(validateCoveWorkspace(workspaceDir)).rejects.toThrow(/inventory/u);
});

test('refuses a preexisting noncanonical Cove file instead of blessing its bytes', async () => {
    await fs.writeFile(path.join(workspaceDir, 'MEMORY.md'), '# ordinary Agent memory\n');

    await expect(seedCoveWorkspace(workspaceDir)).rejects.toThrow(/contents/u);
});

test('refreshes factory guidance without overwriting Cove-owned memory or objectives', async () => {
    await fs.mkdir(path.join(workspaceDir, 'notes'));
    await fs.writeFile(path.join(workspaceDir, 'MEMORY.md'), '# Cove\n\nLearned context.\n');
    await fs.writeFile(
        path.join(workspaceDir, 'notes', 'onboarding_objectives.md'),
        'owner progress\n'
    );
    await fs.writeFile(path.join(workspaceDir, 'notes', 'onboarding_playbook.md'), legacyPlaybook);
    await fs.writeFile(path.join(workspaceDir, 'notes', 'onboarding_knowledge_faq.md'), legacyFaq);
    await fs.writeFile(path.join(workspaceDir, 'owner-note.md'), 'keep me\n');

    expect(await inspectCoveFactoryGuidance(workspaceDir)).toMatchObject({ kind: 'refresh' });
    expect(await reconcileCoveFactoryGuidance(workspaceDir)).toMatchObject({ kind: 'refresh' });
    expect(await inspectCoveFactoryGuidance(workspaceDir)).toEqual({ kind: 'current' });
    expect(await reconcileCoveFactoryGuidance(workspaceDir)).toEqual({ kind: 'current' });
    expect(await fs.readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf8')).toContain(
        'Learned context.'
    );
    expect(
        await fs.readFile(path.join(workspaceDir, 'notes', 'onboarding_objectives.md'), 'utf8')
    ).toBe('owner progress\n');
    expect(await fs.readFile(path.join(workspaceDir, 'owner-note.md'), 'utf8')).toBe('keep me\n');
    expect(
        await fs.readFile(path.join(workspaceDir, 'notes', 'onboarding_playbook.md'), 'utf8')
    ).toContain('When the owner agrees another Agent would help, create it yourself');
    expect(
        await fs.readFile(path.join(workspaceDir, 'notes', 'onboarding_knowledge_faq.md'), 'utf8')
    ).toContain('create it with `haus agent create`');
});

test('refuses to replace missing or Agent-edited factory guidance', async () => {
    await fs.mkdir(path.join(workspaceDir, 'notes'));
    await fs.writeFile(
        path.join(workspaceDir, 'notes', 'onboarding_playbook.md'),
        'owner customization\n'
    );

    expect(await reconcileCoveFactoryGuidance(workspaceDir)).toEqual({
        files: ['notes/onboarding_knowledge_faq.md', 'notes/onboarding_playbook.md'],
        kind: 'conflict',
    });
    expect(
        await fs.readFile(path.join(workspaceDir, 'notes', 'onboarding_playbook.md'), 'utf8')
    ).toBe('owner customization\n');
    await expect(
        fs.readFile(path.join(workspaceDir, 'notes', 'onboarding_knowledge_faq.md'), 'utf8')
    ).rejects.toThrow();
});

const legacyFaq = `# Onboarding Knowledge FAQ

## What can Cove do?

Cove can collaborate in joined Chats, read Server-owned history through the Haus CLI, work in this private workspace, use granted tools and skills, manage Tasks and reminders within current authority, and consult the shared Manual.

## What stays with the owner?

Owners and Admins create and administer Channels, Computers, members, roles, and external connections in the App. Cove should explain the next action and ask the owner to perform it when no Agent command exists.

## Where does history live?

Canonical Chat history lives on Haus Server. Workspace notes are Cove's durable working memory, not a transcript mirror.

## Are Agents archetypes?

No. Agents have real identities and execution settings. Team lanes emerge through work; optional Manual cards can help design them.
`;

const legacyPlaybook = `# Onboarding Playbook

1. Start with the owner's concrete goal, not a feature tour.
2. Propose one useful next action and name who has authority to do it.
3. Use real Haus capabilities only. Never invent unsupported UI affordances, local Chat ownership, or Agent-created Channels.
4. Keep suggestions optional after setup. Record postponements, refusals, and blockers in onboarding_objectives.md.
5. Retrieve a full procedure with \`haus manual get <topic>\` when a seeded summary applies. For an Agent-creation request, retrieve \`recipes/playbook/agent-creation\` before composing the avatar, action, and continuation.
6. Preserve honest authorship: Cove's messages come from Cove turns, never setup machinery.
`;
