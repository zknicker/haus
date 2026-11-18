import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { factoryManagedSkillHashes, seedFactoryManagedSkills } from '@haus/agent-workspace';

/** The release-owned skills one seed writes, and the content hash of each. */
export interface ManagedSkillFactory {
    hashes(): Record<string, string>;
    seed(skillsDir: string): Promise<void>;
}

/** A pending change notice, plus the exact hashes it announces so a clear cannot drop a newer change. */
export interface ManagedSkillChangeNotice {
    announced: Record<string, string>;
    text: string;
}

const releaseFactory: ManagedSkillFactory = {
    hashes: factoryManagedSkillHashes,
    seed: seedFactoryManagedSkills,
};

/**
 * Seeds the factory-managed skills into one Agent's library and queues a one-turn notice for every
 * managed skill whose content changed since this Agent's last seed. An identical reseed, a
 * brand-new Agent, and a managed skill this Agent never had queue nothing. An Agent seeded before
 * this record existed but already holding the skill is notified once, since nothing proves its
 * copy matched. Agent-authored and imported skills never participate.
 */
export async function seedAgentManagedSkills(
    agentRoot: string,
    factory: ManagedSkillFactory = releaseFactory
): Promise<void> {
    const skillsDir = join(agentRoot, 'skills');
    const current = factory.hashes();
    const prior = await readRecord(agentRoot);
    const heldBeforeSeed = prior ? null : await existingSkillDirs(skillsDir, Object.keys(current));
    await factory.seed(skillsDir);
    const changed = Object.keys(current).filter((skillId) =>
        prior
            ? prior.seeded[skillId] !== undefined && prior.seeded[skillId] !== current[skillId]
            : (heldBeforeSeed?.has(skillId) ?? false)
    );
    const pending = { ...prior?.pending };
    for (const skillId of changed) {
        pending[skillId] = current[skillId] as string;
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

/** Generic for every skill; event input, never the standing prompt. */
export function managedSkillChangeText(names: readonly string[]): string {
    return `[Haus skill update: these Haus skills were updated: ${names.join(', ')}.] Re-read each before you next use it, and rebuild any scripts, notes, memory, or recipes you derived from it. If that changed something you rely on, post one short note in #all saying what you updated; otherwise do not post.`;
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

async function existingSkillDirs(skillsDir: string, skillIds: string[]): Promise<Set<string>> {
    const held = new Set<string>();
    for (const skillId of skillIds) {
        try {
            if ((await stat(join(skillsDir, skillId))).isDirectory()) {
                held.add(skillId);
            }
        } catch (error) {
            if (!isMissing(error)) {
                throw error;
            }
        }
    }
    return held;
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
