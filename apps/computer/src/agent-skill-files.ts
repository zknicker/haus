import { createHash, randomBytes } from 'node:crypto';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSkillFile, AgentSkillFileRequest, AgentSkillFileResult } from '@haus/api';
import { agentSkillFileRequestSchema } from '@haus/api';
import { reportStateError } from './computer-report.ts';
import { readSkillBundle, skillNamePattern } from './host-skill-bundle.ts';

export function parseAgentSkillFileRequest(frame: unknown): AgentSkillFileRequest | null {
    const parsed = agentSkillFileRequestSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Answers a relayed Agent skill file request; returns false when the frame is not one. */
export function handleAgentSkillFileRequest(
    frame: unknown,
    input: {
        dataRoot: string;
        refreshReport(): Promise<void>;
        send(frame: unknown): boolean;
        serverId: string;
        track<T>(work: Promise<T>): Promise<T>;
        waitForRun(agentId: string): Promise<void>;
    }
): boolean {
    const request = parseAgentSkillFileRequest(frame);
    if (!request) {
        return false;
    }
    const mutates = request.operation.kind !== 'read';
    void input.track(
        (mutates ? input.waitForRun(request.agentId) : Promise.resolve())
            .then(() =>
                runAgentSkillFileRequest({
                    dataRoot: input.dataRoot,
                    request,
                    serverId: input.serverId,
                })
            )
            .then(async (result) => {
                input.send(result);
                if (mutates && result.result) {
                    await input.refreshReport();
                }
            })
            .catch(reportStateError)
    );
    return true;
}

export async function runAgentSkillFileRequest(input: {
    dataRoot: string;
    request: AgentSkillFileRequest;
    serverId: string;
}): Promise<AgentSkillFileResult> {
    try {
        const skillRoot = await resolveSkillRoot(input);
        const current = await readAgentSkillFile(skillRoot, input.request.operation.name);
        const operation = input.request.operation;
        if (operation.kind === 'read') {
            return success(input.request, { kind: 'read', value: current });
        }
        if (operation.expectedHash !== current.hash) {
            throw new Error('This skill changed since you opened it. Reload it before continuing.');
        }
        if (operation.kind === 'delete') {
            await rm(skillRoot, { recursive: true });
            return success(input.request, { kind: 'deleted' });
        }
        const temporary = join(skillRoot, `.SKILL.md-${randomBytes(8).toString('hex')}`);
        try {
            await writeFile(temporary, operation.content, { mode: 0o600 });
            await rename(temporary, join(skillRoot, 'SKILL.md'));
        } finally {
            await rm(temporary, { force: true });
        }
        return success(input.request, {
            kind: 'updated',
            value: await readAgentSkillFile(skillRoot, operation.name),
        });
    } catch (cause) {
        return {
            agentId: input.request.agentId,
            error: safeSkillFileError(cause),
            requestId: input.request.requestId,
            type: 'agent-skill-file-result',
        };
    }
}

async function resolveSkillRoot(input: {
    dataRoot: string;
    request: AgentSkillFileRequest;
    serverId: string;
}) {
    const name = input.request.operation.name;
    if (!skillNamePattern.test(name)) {
        throw new Error('That Agent skill does not exist.');
    }
    const root = join(
        input.dataRoot,
        'servers',
        input.serverId,
        'agents',
        input.request.agentId,
        'skills',
        name
    );
    const directory = await lstat(root).catch(() => null);
    const skillFile = await lstat(join(root, 'SKILL.md')).catch(() => null);
    if (!directory?.isDirectory() || directory.isSymbolicLink() || !skillFile?.isFile()) {
        throw new Error('That Agent skill does not exist.');
    }
    return root;
}

async function readAgentSkillFile(skillRoot: string, name: string): Promise<AgentSkillFile> {
    const files = await readSkillBundle(skillRoot);
    const skill = files.find((file) => file.path === 'SKILL.md');
    if (!skill) {
        throw new Error('That Agent skill does not exist.');
    }
    return {
        content: await readFile(join(skillRoot, 'SKILL.md'), 'utf8'),
        hash: hashSkillBundle(files),
        name,
        updatedAt: new Date(Math.max(...files.map((file) => file.modifiedAt))).toISOString(),
    };
}

function hashSkillBundle(files: Awaited<ReturnType<typeof readSkillBundle>>) {
    const hash = createHash('sha256');
    for (const file of files) {
        hash.update(file.path);
        hash.update(file.content);
    }
    return hash.digest('hex');
}

function success(
    request: AgentSkillFileRequest,
    result: NonNullable<AgentSkillFileResult['result']>
): AgentSkillFileResult {
    return {
        agentId: request.agentId,
        requestId: request.requestId,
        result,
        type: 'agent-skill-file-result',
    };
}

function safeSkillFileError(cause: unknown) {
    const message = cause instanceof Error ? cause.message : '';
    return [
        'That Agent skill does not exist.',
        'This skill changed since you opened it. Reload it before continuing.',
    ].includes(message)
        ? message
        : 'The Agent skill could not be changed.';
}
