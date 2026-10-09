import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { coveOnboardingFaq } from './cove-factory-faq.ts';
import { coveOnboardingPlaybook } from './cove-factory-guidance.ts';
import {
    type CoveFactoryGuidanceFile,
    type CoveFactoryGuidancePlan,
    inspectCoveFactoryGuidance,
    reconcileCoveFactoryGuidance,
    seedCoveWorkspace,
} from './cove-starter-kit.ts';

const faqFile = 'notes/onboarding_knowledge_faq.md';
const playbookFile = 'notes/onboarding_playbook.md';
const guidanceFiles: CoveFactoryGuidanceFile[] = [faqFile, playbookFile];
// Golden exports captured from d031dd7e0 and the local daily chief-of-staff
// rendering before the weekly revision. Tests never depend on git or other checkouts.
const deployedPlaybook = await fixture('cove-d031-playbook.md');
const deployedFaq = await fixture('cove-d031-faq.md');
const dailyPlaybook = await fixture('cove-local-daily-playbook.md');
const legacyFaq = await fixture('cove-legacy-faq.md');
const outgoingWeeklyPlaybook = await fixture('cove-outgoing-weekly-playbook.md');
// Shipped 9.0–9.4 rendering, whose coordination note kept a run-by-run ledger.
const ledgerPlaybook = await fixture('cove-9-0-playbook.md');
const revisions = [
    { name: 'deployed d031', faq: deployedFaq, playbook: deployedPlaybook },
    { name: 'previous local daily', faq: deployedFaq, playbook: dailyPlaybook },
    { name: 'outgoing weekly', faq: deployedFaq, playbook: outgoingWeeklyPlaybook },
];
const reviewStates = ['offered', 'pending', 'enabled', 'declined', 'postponed'] as const;
let workspaceDir = '';

beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haus-cove-weekly-'));
});

afterEach(async () => {
    await fs.rm(workspaceDir, { force: true, recursive: true });
});

test('fresh Cove seeds weekly guidance without installing a coordination agreement', async () => {
    const manifest = await seedCoveWorkspace(workspaceDir);
    expect(await seedCoveWorkspace(workspaceDir)).toBe(manifest);
    const playbook = await read(playbookFile);
    expect(playbook).toBe(coveOnboardingPlaybook);
    expect(playbook).toMatch(/default[^.]*weekly|default[^.]*once (?:a|per) week/iu);
    expect(playbook).not.toContain('Default\nproposal is once daily');
    expect(await inspectCoveFactoryGuidance(workspaceDir)).toEqual({ kind: 'current' });
    expect(await reconcileCoveFactoryGuidance(workspaceDir)).toEqual({ kind: 'current' });
    expect((await fs.readdir(path.join(workspaceDir, 'notes'))).sort()).toEqual([
        'onboarding_knowledge_faq.md',
        'onboarding_objectives.md',
        'onboarding_playbook.md',
    ]);
});

test('legacy fixtures pin genuine deployed and outgoing daily factory renderings', () => {
    expect(sha256(deployedPlaybook)).toBe(
        '61123e7c0e58a333b6f8a5079cc58e9c269d019c38c615668d802a9dfee17b5e'
    );
    expect(sha256(deployedFaq)).toBe(
        '1b2de68cf54e38527070e41eb70b5164c31fda3e1ffd5763d48eb2d7e27e50c5'
    );
    expect(sha256(dailyPlaybook)).toBe(
        '453a0401f06bdb052d8257ff47214425c008aac04e4180a94bf895830233e50b'
    );
    expect(dailyPlaybook).toContain('proposal is once daily');
    expect(sha256(outgoingWeeklyPlaybook)).toBe(
        '864698e59425d4f3ba974f4fb27734556afd5cf6e86146a3f60bfb7757643500'
    );
});

test('shipped ledger playbook refreshes to current-state coordination guidance', async () => {
    expect(sha256(ledgerPlaybook)).toBe(
        '1a78df111c683bb961e97a21cc56e67c22095031c5aeb260d39808c8c0868e05'
    );
    expect(ledgerPlaybook).toContain('save its message id');
    await seedCoveWorkspace(workspaceDir);
    await write(playbookFile, ledgerPlaybook);
    await write('notes/coordination.md', coordinationNote('enabled'));
    const expected: CoveFactoryGuidancePlan = { files: [playbookFile], kind: 'refresh' };
    expect(await reconcileCoveFactoryGuidance(workspaceDir)).toEqual(expected);
    expect(await read(playbookFile)).toBe(coveOnboardingPlaybook);
    expect(await read('notes/coordination.md')).toBe(coordinationNote('enabled'));
});

test('playbook keeps coordination notes as current state, not a ledger', () => {
    expect(coveOnboardingPlaybook).toContain(
        'notes/coordination.md is current state, rewritten in place; history stays in Haus\nchats.'
    );
    // Pruning must not forget a declined suggestion, or the next review re-raises it.
    expect(coveOnboardingPlaybook).toContain('keep owner-declined suggestions so they stay quiet');
    expect(coveOnboardingPlaybook).not.toMatch(
        /save its message id|confirmed send id|consent message id, Chats/u
    );
});

for (const revision of revisions) {
    for (const state of reviewStates) {
        test(`upgrades ${revision.name} while preserving ${state} review and learned files`, async () => {
            await seedCoveWorkspace(workspaceDir);
            await write(faqFile, revision.faq);
            await write(playbookFile, revision.playbook);
            const learnedFiles = {
                'MEMORY.md': '# Cove\n\nOwner: Mara. Review notes: notes/coordination.md\n',
                'notes/onboarding_objectives.md':
                    'real-work: done\nstarter-team: skipped\nrefusal_note: Keep existing team.\n',
                'notes/coordination.md': coordinationNote(state),
                'notes/owner-preferences.md': 'Keep Friday implementation reviews with @ada.\n',
            };
            for (const [name, content] of Object.entries(learnedFiles)) {
                await write(name, content);
            }
            const before = await snapshot();
            const expected: CoveFactoryGuidancePlan = {
                files: [faqFile, playbookFile],
                kind: 'refresh',
            };
            expect(await inspectCoveFactoryGuidance(workspaceDir)).toEqual(expected);
            // Inspection is read-only, including offered/pending review input and receipts.
            expect(await snapshot()).toEqual(before);
            expect(await reconcileCoveFactoryGuidance(workspaceDir)).toEqual(expected);
            expect(await snapshot()).toEqual({
                ...before,
                [faqFile]: coveOnboardingFaq,
                [playbookFile]: coveOnboardingPlaybook,
            });
            expect(await inspectCoveFactoryGuidance(workspaceDir)).toEqual({ kind: 'current' });
            expect(await reconcileCoveFactoryGuidance(workspaceDir)).toEqual({ kind: 'current' });
            expect(await read('notes/coordination.md')).toBe(learnedFiles['notes/coordination.md']);
        });
    }
}

for (const conflictedFile of guidanceFiles) {
    for (const modification of ['custom', 'edited', 'missing'] as const) {
        test(`${modification} ${conflictedFile} prevents overwriting either guidance file`, async () => {
            await seedCoveWorkspace(workspaceDir);
            await write(faqFile, legacyFaq);
            await write(playbookFile, dailyPlaybook);
            await write('notes/coordination.md', coordinationNote('declined'));
            if (modification === 'missing') {
                await fs.rm(path.join(workspaceDir, conflictedFile));
            } else {
                const content =
                    modification === 'custom'
                        ? '# Owner-authored guidance\nUse the existing review process.\n'
                        : `${await read(conflictedFile)}\nOwner correction: preserve daily cadence.\n`;
                await write(conflictedFile, content);
            }
            const before = await snapshot();
            const expected: CoveFactoryGuidancePlan = { files: [conflictedFile], kind: 'conflict' };
            expect(await inspectCoveFactoryGuidance(workspaceDir)).toEqual(expected);
            expect(await reconcileCoveFactoryGuidance(workspaceDir)).toEqual(expected);
            expect(await snapshot()).toEqual(before);
            // Repeated startup reconciliation must neither partially refresh nor recreate a file.
            expect(await reconcileCoveFactoryGuidance(workspaceDir)).toEqual(expected);
            expect(await snapshot()).toEqual(before);
        });
    }
}

function coordinationNote(state: (typeof reviewStates)[number]): string {
    const receipts = {
        offered: 'consent_message_id:\nreminder_id:\n',
        pending: 'consent_message_id: msg-consent\nreminder_id:\n',
        enabled: 'consent_message_id: msg-consent\nreminder_id: reminder-installed\n',
        declined: 'consent_message_id: msg-decline\nreminder_id: reminder-canceled\n',
        postponed: 'consent_message_id:\nreminder_id:\nrevisit_after: 2026-12-01\n',
    };
    return `# Owner's Coordination Notes\nreview_offer_state: ${state}\n${receipts[state]}chats: #design, #shipping\ncadence: daily\ntimezone: America/New_York\ndestination: dm:owner\ncommand_id: cove-review-msg-consent-r1\nfire_at: 2026-10-06T13:00:00Z\nexact_input: haus reminder schedule --command-id cove-review-msg-consent-r1 --fire-at 2026-10-06T13:00:00Z --repeat daily --message-id msg-consent --title "Check agreed lanes"\nlast_raised_evidence: task-42/msg-17\nlast_send_id: msg-18\nOwner correction: no messages for unchanged findings.\nPending decision: owner chooses launch date.\nHandoff: @ada owns task-42; review at agreed checkpoint.\n`;
}

async function fixture(name: string): Promise<string> {
    return await fs.readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function sha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

async function read(name: string): Promise<string> {
    return await fs.readFile(path.join(workspaceDir, name), 'utf8');
}

async function write(name: string, content: string): Promise<void> {
    await fs.writeFile(path.join(workspaceDir, name), content);
}

async function snapshot(): Promise<Record<string, string>> {
    const names = ['MEMORY.md'];
    for (const name of await fs.readdir(path.join(workspaceDir, 'notes'))) {
        names.push(`notes/${name}`);
    }
    return Object.fromEntries(
        await Promise.all(names.map(async (name) => [name, await read(name)]))
    );
}
