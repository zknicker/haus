import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { managedSkillChangeText } from '@haus/agent-prompt';
import {
    factoryManagedSkillHashes,
    heldManagedSkillHash,
    seedFactoryManagedSkills,
} from '@haus/agent-workspace';

/** The release-owned skills, the content hash of each, and how to hash and write an Agent's copy. */
export interface ManagedSkillFactory {
    hashes(): Record<string, string>;
    held(skillsDir: string, skillId: string): Promise<string | null>;
    seed(skillsDir: string, skillIds: readonly string[]): Promise<void>;
}

/** A pending change notice, plus the exact hashes it announces so a clear cannot drop a newer change. */
export interface ManagedSkillChangeNotice {
    announced: Record<string, string>;
    text: string;
}

const releaseFactory: ManagedSkillFactory = {
    hashes: factoryManagedSkillHashes,
    held: heldManagedSkillHash,
    seed: seedFactoryManagedSkills,
};

/**
 * Seeds the factory-managed skills into one Agent's library by comparing the bytes it holds with
 * the release. A missing skill is written, an unedited copy of the release this Agent was last
 * seeded with is updated and queues a one-turn notice, and anything else is an edit made in Drive
 * and stands, with or without a record. Agent-authored and imported skills never participate.
 */
export async function seedAgentManagedSkills(
    agentRoot: string,
    skillsDir: string,
    factory: ManagedSkillFactory = releaseFactory
): Promise<void> {
    const current = factory.hashes();
    const prior = await readRecord(agentRoot);
    if (prior && sameMap(prior.seeded, current)) {
        return;
    }
    const steps = new Map<string, ReturnType<typeof seedStep>>();
    for (const [skillId, hash] of Object.entries(current)) {
        steps.set(
            skillId,
            seedStep(await factory.held(skillsDir, skillId), hash, prior?.seeded[skillId])
        );
    }
    await factory.seed(
        skillsDir,
        [...steps].flatMap(([skillId, step]) => (step === 'keep' ? [] : [skillId]))
    );
    const pending = { ...prior?.pending };
    for (const [skillId, step] of steps) {
        if (step === 'update') {
            pending[skillId] = current[skillId] as string;
        }
    }
    const next: ManagedSkillRecord = { pending, seeded: current };
    if (prior && sameRecord(prior, next)) {
        return;
    }
    await writeRecord(agentRoot, next);
}

/** The pending notice for the next turn input, or null. Reading never clears it. */
export async function readManagedSkillChangeNotice(
    agentRoot: string
): Promise<ManagedSkillChangeNotice | null> {
    const record = await readRecord(agentRoot);
    const names = Object.keys(record?.pending ?? {}).sort();
    if (!record || names.length === 0) {
        return null;
    }
    return { announced: { ...record.pending }, text: managedSkillChangeText(names) };
}

/**
 * Clears what a completed turn delivered. A skill that changed again after the notice was
 * composed keeps its newer pending hash and is announced on the following turn.
 */
export async function clearManagedSkillChangeNotice(
    agentRoot: string,
    notice: ManagedSkillChangeNotice
): Promise<void> {
    const record = await readRecord(agentRoot);
    if (!record) {
        return;
    }
    const pending = Object.fromEntries(
        Object.entries(record.pending).filter(
            ([skillId, hash]) => notice.announced[skillId] !== hash
        )
    );
    await writeRecord(agentRoot, { ...record, pending });
}

interface ManagedSkillRecord {
    /** Changed skills not yet delivered to a completed turn, by the hash that changed them. */
    pending: Record<string, string>;
    /** The hash of every managed skill as last seeded. */
    seeded: Record<string, string>;
}

function recordPath(agentRoot: string): string {
    return join(agentRoot, 'runtime', 'managed-skills.json');
}

async function readRecord(agentRoot: string): Promise<ManagedSkillRecord | null> {
    let raw: string;
    try {
        raw = await readFile(recordPath(agentRoot), 'utf8');
    } catch (error) {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    }
    return parseRecord(raw);
}

/** Writes are atomic, so an unreadable record is foreign; it reads as absent and reseeds cleanly. */
function parseRecord(raw: string): ManagedSkillRecord | null {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!(isRecord(value) && isHashMap(value.seeded) && isHashMap(value.pending))) {
        return null;
    }
    return { pending: value.pending, seeded: value.seeded };
}

async function writeRecord(agentRoot: string, record: ManagedSkillRecord): Promise<void> {
    const destination = recordPath(agentRoot);
    await mkdir(join(agentRoot, 'runtime'), { mode: 0o700, recursive: true });
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
}

function seedStep(held: string | null, release: string, lastSeeded: string | undefined) {
    if (held === null) {
        return 'write';
    }
    if (held !== release && held === lastSeeded) {
        return 'update';
    }
    return 'keep';
}

function sameRecord(left: ManagedSkillRecord, right: ManagedSkillRecord): boolean {
    return sameMap(left.seeded, right.seeded) && sameMap(left.pending, right.pending);
}

function sameMap(left: Record<string, string>, right: Record<string, string>): boolean {
    const keys = Object.keys(left);
    return (
        keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
    );
}

function isHashMap(value: unknown): value is Record<string, string> {
    return isRecord(value) && Object.values(value).every((hash) => typeof hash === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
    return isRecord(error) && error.code === 'ENOENT';
}
