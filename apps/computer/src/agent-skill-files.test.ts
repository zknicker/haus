import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentSkillFileRequest } from './agent-skill-files.ts';

const agentId = 'agt_1234567890123456';
const serverId = 'srv_1234567890123456';
let dataRoot: string;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-skill-file-'));
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

test('reads and hash-guards updates to an Agent skill', async () => {
    const skillRoot = join(dataRoot, 'servers', serverId, 'agents', agentId, 'skills', 'research');
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, 'SKILL.md'), '# Research\n');
    const read = await request(dataRoot, { kind: 'read', name: 'research' });
    expect(read.result?.kind).toBe('read');
    const hash = read.result?.kind === 'read' ? read.result.value.hash : '';

    const stale = await request(dataRoot, {
        content: '# Wrong\n',
        expectedHash: 'a'.repeat(64),
        kind: 'update',
        name: 'research',
    });
    expect(stale.error).toContain('changed since you opened');
    expect(await readFile(join(skillRoot, 'SKILL.md'), 'utf8')).toBe('# Research\n');

    const updated = await request(dataRoot, {
        content: '# Better research\n',
        expectedHash: hash,
        kind: 'update',
        name: 'research',
    });
    expect(updated.result?.kind).toBe('updated');
    expect(await readFile(join(skillRoot, 'SKILL.md'), 'utf8')).toBe('# Better research\n');
});

test('deletes the independent Agent skill bundle after hash confirmation', async () => {
    const skillRoot = join(dataRoot, 'servers', serverId, 'agents', agentId, 'skills', 'research');
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, 'SKILL.md'), '# Research\n');
    await writeFile(join(skillRoot, 'helper.bin'), new Uint8Array([0, 1, 2]));
    const read = await request(dataRoot, { kind: 'read', name: 'research' });
    const hash = read.result?.kind === 'read' ? read.result.value.hash : '';
    const deleted = await request(dataRoot, {
        expectedHash: hash,
        kind: 'delete',
        name: 'research',
    });
    expect(deleted.result).toEqual({ kind: 'deleted' });
    expect(await readFile(join(skillRoot, 'SKILL.md')).catch(() => null)).toBeNull();
});

function request(
    dataRoot: string,
    operation:
        | { kind: 'read'; name: string }
        | { content: string; expectedHash: string; kind: 'update'; name: string }
        | { expectedHash: string; kind: 'delete'; name: string }
) {
    return runAgentSkillFileRequest({
        dataRoot,
        request: {
            agentId,
            operation,
            requestId: 'req_1234567890123456',
            type: 'agent-skill-file-request',
        },
        serverId,
    });
}
