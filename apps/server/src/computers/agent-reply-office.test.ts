import { afterAll, expect, test } from 'bun:test';
import type { AgentSkillFileResult, AgentSkillImportResult, AgentWorkspaceResult } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { AgentReplyOffice } from './agent-reply-office.ts';

const agentId = 'agt_1234567890123456';
const computerId = 'cmp_1234567890123456';
const otherComputerId = 'cmp_0000000000000000';
const runtime = makeTestRuntime();

afterAll(() => runtime.dispose());

test('settles each Agent reply only after its matching Computer and Agent prove identity', async () => {
    const frames: Record<string, unknown>[] = [];
    const office = createOffice((_, frame) => {
        frames.push(frame as Record<string, unknown>);
        return true;
    });
    const skillImport = office.requestSkillImport(computerId, {
        agentId,
        sourceId: 'hsk_1234567890123456',
    });
    const skillImportRequestId = requestId(frames);
    expect(office.acceptSkillImport(otherComputerId, skillImportResult(skillImportRequestId))).toBe(
        false
    );
    expect(office.acceptSkillImport(computerId, skillImportResult(skillImportRequestId))).toBe(
        true
    );
    await expect(skillImport).resolves.toEqual({
        requestId: skillImportRequestId,
        status: 'accepted',
    });

    const skillFile = office.requestSkillFile(computerId, {
        agentId,
        operation: { kind: 'read', name: 'research' },
    });
    const skillFileRequestId = requestId(frames);
    expect(
        office.acceptSkillFile(computerId, skillFileResult(skillFileRequestId, 'agt_other'))
    ).toBe(false);
    await expect(isPending(skillFile)).resolves.toBe(true);
    expect(office.acceptSkillFile(computerId, skillFileResult(skillFileRequestId))).toBe(true);
    expect(office.acceptSkillFile(computerId, skillFileResult(skillFileRequestId))).toBe(false);
    await expect(skillFile).resolves.toMatchObject({ kind: 'read' });

    const workspace = office.requestWorkspace(computerId, {
        agentId,
        operation: { includeHidden: false, kind: 'list', path: '' },
    });
    const workspaceRequestId = requestId(frames);
    expect(office.acceptWorkspace(computerId, workspaceResult(workspaceRequestId))).toBe(true);
    await expect(workspace).resolves.toMatchObject({ kind: 'list' });
});

test('times out bounded replies, leaves imports unbounded, and rejects late replies', async () => {
    const frames: Record<string, unknown>[] = [];
    const office = createOffice((_, frame) => {
        frames.push(frame as Record<string, unknown>);
        return true;
    }, 0);
    await expect(
        office.requestSkillFile(computerId, {
            agentId,
            operation: { kind: 'read', name: 'research' },
        })
    ).rejects.toThrow('The Computer did not answer the skill request.');
    const expiredRequestId = requestId(frames);
    expect(office.acceptSkillFile(computerId, skillFileResult(expiredRequestId))).toBe(false);
    await expect(
        office.requestWorkspace(computerId, {
            agentId,
            operation: { includeHidden: false, kind: 'list', path: '' },
        })
    ).rejects.toThrow('The Computer did not answer the workspace request.');

    const skillImport = office.requestSkillImport(computerId, {
        agentId,
        sourceId: 'hsk_1234567890123456',
    });
    await expect(isPending(skillImport)).resolves.toBe(true);
    office.disconnect(computerId);
    await expect(skillImport).rejects.toThrow('The selected Computer went offline.');
});

test('disconnect and send failures clean up only the affected Computer', async () => {
    const frames: Record<string, unknown>[] = [];
    const office = createOffice((_, frame) => {
        frames.push(frame as Record<string, unknown>);
        return true;
    });
    const first = office.requestSkillFile(computerId, {
        agentId,
        operation: { kind: 'read', name: 'first' },
    });
    const second = office.requestSkillFile(otherComputerId, {
        agentId,
        operation: { kind: 'read', name: 'second' },
    });
    const secondRequestId = requestId(frames);
    office.disconnect(computerId);
    await expect(first).rejects.toThrow('The selected Computer went offline.');
    expect(office.acceptSkillFile(otherComputerId, skillFileResult(secondRequestId))).toBe(true);
    await expect(second).resolves.toMatchObject({ kind: 'read' });

    const throwingOffice = createOffice(() => {
        throw new Error('socket closed');
    });
    await expect(
        throwingOffice.requestWorkspace(computerId, {
            agentId,
            operation: { includeHidden: false, kind: 'list', path: '' },
        })
    ).rejects.toThrow('socket closed');
});

function createOffice(
    send: (computerId: string, frame: unknown) => boolean,
    timeoutMs?: number
): AgentReplyOffice {
    return new AgentReplyOffice({ runtime, send, timeoutMs });
}

function requestId(frames: Record<string, unknown>[]): string {
    return String(frames.at(-1)?.requestId);
}

async function isPending(promise: Promise<unknown>): Promise<boolean> {
    return await Promise.race([
        promise.then(
            () => false,
            () => false
        ),
        Bun.sleep(5).then(() => true),
    ]);
}

function skillImportResult(requestId: string): AgentSkillImportResult {
    return {
        agentId,
        requestId,
        sourceId: 'hsk_1234567890123456',
        status: 'accepted',
        type: 'agent-skill-import-result',
        updatedAt: '2026-07-27T00:00:00.000Z',
    };
}

function skillFileResult(requestId: string, resultAgentId = agentId): AgentSkillFileResult {
    return {
        agentId: resultAgentId,
        requestId,
        result: {
            kind: 'read',
            value: {
                content: '# Research\n',
                hash: 'a'.repeat(64),
                name: 'research',
                updatedAt: '2026-07-27T00:00:00.000Z',
            },
        },
        type: 'agent-skill-file-result',
    };
}

function workspaceResult(requestId: string): AgentWorkspaceResult {
    return {
        agentId,
        requestId,
        result: {
            kind: 'list',
            value: { entries: [], path: '', workspaceRoot: '/computer/agent/workspace' },
        },
        type: 'agent-workspace-result',
    };
}
