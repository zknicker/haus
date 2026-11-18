import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type AgentSkillImportCommand,
    type AgentSkillImportRecord,
    agentSkillImportRecordSchema,
} from '@haus/api';

export async function acceptHostSkillImport(input: {
    command: AgentSkillImportCommand;
    dataRoot: string;
    serverId: string;
}): Promise<AgentSkillImportRecord> {
    const previous = await readSkillImportRecord(
        input.dataRoot,
        input.serverId,
        input.command.requestId
    );
    if (previous) {
        if (
            previous.agentId !== input.command.agentId ||
            previous.sourceId !== input.command.sourceId
        ) {
            throw new Error('Skill import request id was already used for another import.');
        }
        return previous;
    }
    return await writeSkillImportRecord(input.dataRoot, input.serverId, {
        agentId: input.command.agentId,
        requestId: input.command.requestId,
        sourceId: input.command.sourceId,
        status: 'accepted',
        updatedAt: new Date().toISOString(),
    });
}

export async function finishHostSkillImport(input: {
    dataRoot: string;
    record:
        | Omit<Extract<AgentSkillImportRecord, { status: 'applied' }>, 'updatedAt'>
        | Omit<Extract<AgentSkillImportRecord, { status: 'failed' }>, 'updatedAt'>;
    serverId: string;
}): Promise<AgentSkillImportRecord> {
    return await writeSkillImportRecord(input.dataRoot, input.serverId, {
        ...input.record,
        updatedAt: new Date().toISOString(),
    });
}

export async function listAgentSkillImportReports(
    dataRoot: string,
    serverId: string
): Promise<AgentSkillImportRecord[]> {
    return (await readSkillImportRecords(dataRoot, serverId)).slice(0, 100);
}

export async function listAcceptedHostSkillImports(
    dataRoot: string,
    serverId: string
): Promise<Extract<AgentSkillImportRecord, { status: 'accepted' }>[]> {
    return (await readSkillImportRecords(dataRoot, serverId)).filter(
        (record): record is Extract<AgentSkillImportRecord, { status: 'accepted' }> =>
            record.status === 'accepted'
    );
}

async function readSkillImportRecords(dataRoot: string, serverId: string) {
    const root = skillImportRoot(dataRoot, serverId);
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    const records = await Promise.all(
        entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map(async (entry) => {
                const raw = await readFile(join(root, entry.name), 'utf8').catch(() => null);
                if (!raw) {
                    return null;
                }
                try {
                    return agentSkillImportRecordSchema.parse(JSON.parse(raw));
                } catch {
                    return null;
                }
            })
    );
    return records
        .filter((record): record is AgentSkillImportRecord => record !== null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function readSkillImportRecord(dataRoot: string, serverId: string, requestId: string) {
    const raw = await readFile(
        join(skillImportRoot(dataRoot, serverId), `${requestId}.json`),
        'utf8'
    ).catch(() => null);
    if (!raw) {
        return null;
    }
    return agentSkillImportRecordSchema.parse(JSON.parse(raw));
}

async function writeSkillImportRecord(
    dataRoot: string,
    serverId: string,
    record: AgentSkillImportRecord
) {
    const parsed = agentSkillImportRecordSchema.parse(record);
    const root = skillImportRoot(dataRoot, serverId);
    await mkdir(root, { mode: 0o700, recursive: true });
    const destination = join(root, `${parsed.requestId}.json`);
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
    return parsed;
}

function skillImportRoot(dataRoot: string, serverId: string) {
    return join(dataRoot, 'servers', serverId, 'skill-imports');
}
