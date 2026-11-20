import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import type { HarnessId } from './runtime-driver.ts';

const fingerprint = z.string().min(1).nullable().catch(null);

const sessionRecordSchema = z.object({
    bootstrapFingerprint: fingerprint,
    deliveredInstructionFingerprint: fingerprint,
    deliveredMemoryDigest: fingerprint,
    deliveredRuleDigests: z.record(z.string(), z.string()).catch({}),
    generation: z.number().int().positive(),
    harness: z.literal('claude-agent-sdk'),
    interruptedTurn: z.boolean().catch(false),
    launchedInstructionFingerprint: fingerprint,
    modelId: z.string().min(1),
    nativeSessionId: z.string().min(1).nullable(),
});

export type AgentSessionRecord = z.infer<typeof sessionRecordSchema>;

export interface AssignedSession {
    readonly generation: number;
    readonly harness: HarnessId;
    readonly modelId: string;
}

export async function readAgentSession(agentDir: string) {
    let raw: string;
    try {
        raw = await readFile(join(agentDir, sessionFileName), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    const parsed = sessionRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
}

export async function writeAgentSession(agentDir: string, record: AgentSessionRecord) {
    await mkdir(agentDir, { mode: 0o700, recursive: true });
    const destination = join(agentDir, sessionFileName);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
}

export function resolveTurnSession(stored: AgentSessionRecord | null, assigned: AssignedSession) {
    if (
        stored &&
        stored.generation === assigned.generation &&
        stored.harness === assigned.harness &&
        stored.modelId === assigned.modelId
    ) {
        return stored;
    }
    return freshSession(assigned);
}

export function freshSession(assigned: AssignedSession) {
    const record: AgentSessionRecord = {
        bootstrapFingerprint: null,
        deliveredInstructionFingerprint: null,
        deliveredMemoryDigest: null,
        deliveredRuleDigests: {},
        generation: assigned.generation,
        harness: assigned.harness,
        interruptedTurn: false,
        launchedInstructionFingerprint: null,
        modelId: assigned.modelId,
        nativeSessionId: null,
    };
    return record;
}

const sessionFileName = 'session.json';
