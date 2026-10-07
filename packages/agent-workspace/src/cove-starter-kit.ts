import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getManualTopic } from '@haus/agent-manual';
import { coveOnboardingFaq } from './cove-factory-faq.ts';
import { coveMemory, coveOnboardingPlaybook } from './cove-factory-guidance.ts';
import { recognizedFactoryGuidanceHashes } from './cove-factory-guidance-hashes.ts';
import { refreshCoveGuidanceFile } from './cove-guidance-file-refresh.ts';

export const coveSeededSummaries = [
    [
        'recipes/decision/one-or-many',
        'Keep one Agent on work with shared context; split only when independent lanes create real leverage.',
    ],
    [
        'recipes/decision/stake-strictness',
        'Match verification and permission checkpoints to the consequence of being wrong.',
    ],
    [
        'recipes/decision/when-to-ask-human',
        'Ask when authority, intent, or an irreversible choice is missing; otherwise continue with bounded assumptions.',
    ],
    [
        'recipes/pattern/discuss-then-assign',
        'Resolve scope and ownership in the Channel before assigning concrete work.',
    ],
    [
        'recipes/pattern/evidence-handoff',
        'Hand work across Agents with the decision, evidence, artifacts, and remaining uncertainty intact.',
    ],
    [
        'recipes/pattern/recurring-recovery',
        'Make recurring work resumable with visible state, failure evidence, and a clear next attempt.',
    ],
    [
        'recipes/technique/html-artifact-discussion',
        'Use a self-contained HTML artifact when a durable interactive explanation beats a long Chat reply.',
    ],
    [
        'recipes/technique/preview-env',
        'Create a realistic preview only when reviewers need to exercise behavior beyond static evidence.',
    ],
    [
        'recipes/technique/reminder-cron',
        'Use visible Server reminders for future attention; Computers execute later work when available.',
    ],
    [
        'recipes/technique/sent-zero',
        'Confirm the intended audience and destination before sending high-consequence or broad communication.',
    ],
    [
        'recipes/technique/task-claim-lock',
        'Claim a Task before working so parallel Agents do not duplicate the same deliverable.',
    ],
    [
        'recipes/technique/video-review',
        'Review time-based media against explicit moments, evidence, and acceptance criteria.',
    ],
] as const;

const coveFiles = {
    'MEMORY.md': coveMemory,
    'notes/onboarding_knowledge_faq.md': coveOnboardingFaq,
    'notes/onboarding_playbook.md': coveOnboardingPlaybook,
    'notes/onboarding_objectives.md': renderObjectives(),
} as const;

const coveFactoryGuidanceFiles = {
    'notes/onboarding_knowledge_faq.md': coveOnboardingFaq,
    'notes/onboarding_playbook.md': coveOnboardingPlaybook,
} as const;

export type CoveWorkspaceFile = keyof typeof coveFiles;
export type CoveFactoryGuidanceFile = keyof typeof coveFactoryGuidanceFiles;
export type CoveFactoryGuidancePlan =
    | { kind: 'conflict'; files: CoveFactoryGuidanceFile[] }
    | { kind: 'current' }
    | { kind: 'refresh'; files: CoveFactoryGuidanceFile[] };
export const coveWorkspaceFiles = Object.keys(coveFiles).sort() as CoveWorkspaceFile[];
const coveWorkspaceInventory = [...coveWorkspaceFiles, 'notes/'].sort();

export async function seedCoveWorkspace(workspaceDir: string): Promise<string> {
    await fs.mkdir(workspaceDir, { recursive: true });
    for (const [name, content] of Object.entries(coveFiles)) {
        const destination = path.join(workspaceDir, name);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, content, { flag: 'wx' }).catch((error) => {
            if (!isExists(error)) {
                throw error;
            }
        });
    }
    return await validateCoveWorkspace(workspaceDir);
}

export async function validateCoveWorkspace(workspaceDir: string): Promise<string> {
    const entries = await readWorkspaceInventory(workspaceDir);
    if (JSON.stringify(entries) !== JSON.stringify(coveWorkspaceInventory)) {
        throw new Error(
            `Cove workspace inventory does not match the factory seed: ${entries.join(', ')}`
        );
    }
    const hash = createHash('sha256');
    for (const name of coveWorkspaceFiles) {
        const actual = await fs.readFile(path.join(workspaceDir, name));
        const expected = Buffer.from(coveFiles[name]);
        if (!actual.equals(expected)) {
            throw new Error(`Cove workspace contents do not match the factory seed: ${name}`);
        }
        hash.update(name);
        hash.update(actual);
    }
    return hash.digest('hex');
}

async function readWorkspaceInventory(
    directory: string,
    relativeDirectory = ''
): Promise<string[]> {
    const inventory: string[] = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        inventory.push(`${relativePath}${entry.isDirectory() ? '/' : ''}`);
        if (entry.isDirectory()) {
            inventory.push(
                ...(await readWorkspaceInventory(path.join(directory, entry.name), relativePath))
            );
        }
    }
    return inventory.sort();
}

/**
 * Classifies only the two immutable factory guidance files. Learned memory and
 * onboarding progress remain Agent-owned and are never candidates for refresh.
 */
export async function inspectCoveFactoryGuidance(
    workspaceDir: string
): Promise<CoveFactoryGuidancePlan> {
    const refresh: CoveFactoryGuidanceFile[] = [];
    const conflicts: CoveFactoryGuidanceFile[] = [];
    for (const name of Object.keys(coveFactoryGuidanceFiles) as CoveFactoryGuidanceFile[]) {
        const actual = await fs.readFile(path.join(workspaceDir, name)).catch((error: unknown) => {
            if (isNotFound(error)) {
                return null;
            }
            throw error;
        });
        if (actual?.equals(Buffer.from(coveFactoryGuidanceFiles[name]))) {
            continue;
        }
        const hash = actual ? createHash('sha256').update(actual).digest('hex') : null;
        if (hash && recognizedFactoryGuidanceHashes[name].includes(hash)) {
            refresh.push(name);
        } else {
            conflicts.push(name);
        }
    }
    if (conflicts.length > 0) {
        return { files: conflicts, kind: 'conflict' };
    }
    return refresh.length > 0 ? { files: refresh, kind: 'refresh' } : { kind: 'current' };
}

/**
 * Replaces recognized prior factory revisions with current bytes. The plan is
 * revalidated per file before replacement. Keep the outgoing inode while checking
 * for concurrent in-place edits; arbitrary external atomic replacement has no file CAS.
 */
export async function reconcileCoveFactoryGuidance(
    workspaceDir: string
): Promise<CoveFactoryGuidancePlan> {
    const plan = await inspectCoveFactoryGuidance(workspaceDir);
    if (plan.kind !== 'refresh') {
        return plan;
    }
    for (const name of plan.files) {
        if (
            !(await refreshCoveGuidanceFile(
                path.join(workspaceDir, name),
                coveFactoryGuidanceFiles[name],
                recognizedFactoryGuidanceHashes[name]
            ))
        ) {
            return { files: [name], kind: 'conflict' };
        }
    }
    return plan;
}

function renderObjectives(): string {
    const summaries = coveSeededSummaries.map(([id, summary]) => {
        const topic = getManualTopic(id);
        if (topic?.kind !== 'recipe' || topic.tier !== 'seeded') {
            throw new Error(`Cove summary points to a missing seeded Manual topic: ${id}`);
        }
        return `### ${id}\n\n${summary}\n\nFull topic: \`${id}\``;
    });
    return `# What I'm Here to Help You Do

Mark these as you go: done, skipped, or later. “Skipped” means the owner said no; do not bring it back unless they do.

This is Cove's private working file for onboarding the Server owner. Keep it current while working. Setup completion does not require these soft objectives.

## Status Contract

- This file is the durable storage mechanism. The \`status\`, \`updated_at\`, and \`refusal_note\` fields under each objective persist across restarts.
- Status values are exactly: \`todo\`, \`done\`, \`skipped\`, \`later\`, \`blocked\`.
- Update one item at a time as the owner moves. Preserve existing fields; do not reset this file on wake.
- \`skipped\` means the owner declined. Record what was declined and do not re-ask until they explicitly reopen it.
- \`later\` means the owner postponed. It is not consent and not refusal.
- \`blocked\` means the next step needs missing authority, an unavailable capability, or a human decision. Say the blocker plainly and move to a useful adjacent step.

## Current Objectives

### 1. real-work
status: todo
updated_at:
refusal_note:

Get one real piece of the owner's work done here — actual work, not a demo.

### 2. starter-team
status: todo
updated_at:
refusal_note:

Build a starter team of at least 3 Agents with clear ownership shaped around the owner's work.

### 3. workstream-chats
status: todo
updated_at:
refusal_note:

Set up Chats that match how the owner works — one real workstream at a time.

### 4. effective-collaboration
status: todo
updated_at:
refusal_note:

Establish a light pattern for assigning, reviewing, and handing off work without excess ceremony.

### 5. ask-me-anything
status: todo
updated_at:
refusal_note:

Make it clear that the owner can ask Cove for practical Haus help at any time.

## Hard Rules

- One ask per turn.
- No more than three owner decisions on day one.
- Ask for consent before inspecting broad local setup. Never scan silently.
- If the owner declines a setup scan, remember the refusal and continue from what they share manually.
- Manual-first when stuck: search for a relevant topic, then fetch the full topic with concise \`--intent\` and \`--reason\` values.
- Do not create a credential disclosure the owner did not request; redact unexpected credential-shaped output.

## Branch Behaviors

### Owner already has workflows

Ask for consent before inspecting relevant local instructions, tool names, and skill names. Read only what supports the proposed workflow, avoid credential-bearing configuration, then report what you inspected and the resulting team proposal.

### Owner is fresh or describes current work

Reflect the work briefly, propose the smallest useful team shape, and make the first action executable. Create the Agent when the owner agrees another one would help.

### Owner is hesitant or silent

Offer a guided walk one choice at a time, always with an exit back to the owner's main question.

## Seeded Practices

These are short versions of the highest-frequency judgment calls. When one applies, retrieve its complete Manual topic before relying on the summary.

${summaries.join('\n\n')}
`;
}

function isExists(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
    );
}

function isNotFound(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
    );
}
