import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planRulesDelivery } from '@haus/agent-prompt';
import { type RunnerSessionPolicy, taskWarmIdleMs } from '@haus/api';
import { driveRoutes } from '../runner-drive-routes.ts';
import {
    cleanups,
    drainCleanups,
    runCredential,
    type ServerStandIn,
    serverStandIn,
} from '../runner-test-server.ts';
import { readAgentContext } from './agent-context.ts';
import { composeTurnPrompt, planMemoryDelivery, sessionAfterTurn } from './instructions.ts';
import { readAgentSession, resolveTurnSession, writeAgentSession } from './session-file.ts';

afterEach(drainCleanups);

const hausRules = 'haus/AGENTS.md';
const projectRules = 'projects/PROD/AGENTS.md';
const agentRules = 'agents/blippy/AGENTS.md';
const header = (path: string) =>
    `The rules in ${path}, as they are now. Follow them. Haus puts them here whenever they changed since this session last saw them.`;

test('a fresh session receives the Haus, home Project, and own rules, then its memory', async () => {
    const { server, turn } = await agentDrive({
        'agents/blippy/MEMORY.md': '# Memory\n- R3 ships Friday.\n',
        [agentRules]: '- Post release notes in #product.\n',
        [hausRules]: '# Haus\n- Answer in the Task.\n',
        [projectRules]: '# product rules\n- Ship behind a flag.\n',
    });

    expect(await turn(false)).toBe(
        [
            '<haus-rules>',
            header(hausRules),
            '',
            '# Haus',
            '- Answer in the Task.',
            '</haus-rules>',
            '',
            '<haus-rules>',
            header(projectRules),
            '',
            '# product rules',
            '- Ship behind a flag.',
            '</haus-rules>',
            '',
            '<haus-rules>',
            header(agentRules),
            '',
            '- Post release notes in #product.',
            '</haus-rules>',
            '',
            '<haus-memory>',
            'Your MEMORY.md, as it is now. Haus puts it here whenever it changed since this session last saw it.',
            '',
            '# Memory',
            '- R3 ships Friday.',
            '</haus-memory>',
            '',
            'Start.',
        ].join('\n')
    );
    expect(
        server.requests
            .filter((request) => request.path.startsWith('/api/agent/artifacts/by-path'))
            .map((request) => [request.path, request.authorization])
            .toSorted()
    ).toEqual([
        [
            '/api/agent/artifacts/by-path?path=agents%2Fblippy%2FAGENTS.md',
            `Bearer ${runCredential}`,
        ],
        [
            '/api/agent/artifacts/by-path?path=agents%2Fblippy%2FMEMORY.md',
            `Bearer ${runCredential}`,
        ],
        ['/api/agent/artifacts/by-path?path=haus%2FAGENTS.md', `Bearer ${runCredential}`],
        [
            '/api/agent/artifacts/by-path?path=projects%2FPROD%2FAGENTS.md',
            `Bearer ${runCredential}`,
        ],
    ]);
});

test('a resumed session receives only the rules file that changed', async () => {
    const { files, turn } = await agentDrive({
        [agentRules]: '- Post release notes in #product.\n',
        [hausRules]: '# Haus\n- Answer in the Task.\n',
    });
    await turn(false);
    files.set(agentRules, '- Post release notes in #releases.\n');

    expect(await turn(true)).toBe(
        [
            '<haus-rules>',
            header(agentRules),
            '',
            '- Post release notes in #releases.',
            '</haus-rules>',
            '',
            'Start.',
        ].join('\n')
    );
    expect(await turn(true)).toBe('Start.');
});

test('a rules file deleted mid-session is announced once', async () => {
    const { files, turn } = await agentDrive({
        [agentRules]: '- Post release notes in #product.\n',
    });
    expect(await turn(false)).toStartWith(`<haus-rules>\n${header(agentRules)}\n`);
    files.delete(agentRules);

    expect(await turn(true)).toBe(
        [
            '<haus-rules>',
            'agents/blippy/AGENTS.md was deleted, so its rules no longer apply.',
            '</haus-rules>',
            '',
            'Start.',
        ].join('\n')
    );
    expect(await turn(true)).toBe('Start.');
});

test('a crew Task reads the Haus and Project rules and its Captain’s WORKER.md, and no memory', async () => {
    const workerRules = 'agents/blippy/WORKER.md';
    const { server, turn } = await agentDrive(
        {
            'agents/blippy/MEMORY.md': '# Memory\n- Captain only.\n',
            [agentRules]: '- Captain only.\n',
            [hausRules]: '# Haus\n- Answer in the Task.\n',
            [workerRules]: '- Open a draft pull request.\n',
        },
        {
            idleCompaction: false,
            kind: 'task',
            memoryPath: null,
            rulePaths: [hausRules, projectRules, workerRules],
            warmIdleMs: taskWarmIdleMs,
        }
    );

    expect(await turn(false)).toBe(
        [
            '<haus-rules>',
            header(hausRules),
            '',
            '# Haus',
            '- Answer in the Task.',
            '</haus-rules>',
            '',
            '<haus-rules>',
            header(workerRules),
            '',
            '- Open a draft pull request.',
            '</haus-rules>',
            '',
            'Start.',
        ].join('\n')
    );
    expect(
        server.requests
            .filter((request) => request.path.startsWith('/api/agent/artifacts/by-path'))
            .map((request) => decodeURIComponent(request.path.split('path=')[1] ?? ''))
            .toSorted()
    ).toEqual([hausRules, workerRules, projectRules].toSorted());
});

async function agentDrive(initial: Record<string, string>, session?: RunnerSessionPolicy) {
    const files = new Map(Object.entries(initial));
    const server = serverStandIn(driveRoutes('blippy', files, 'PROD', session));
    const agentDir = await mkdtemp(join(tmpdir(), 'haus-runner-rules-'));
    cleanups.push(() => rm(agentDir, { force: true, recursive: true }));
    return { files, server, turn: (isResume: boolean) => runnerTurn(server, agentDir, isResume) };
}

async function runnerTurn(server: ServerStandIn, agentDir: string, isResume: boolean) {
    const context = await readAgentContext({
        authority: { agentId: 'agt_1', runCredential, runId: 'run_1', serverUrl: server.url },
        log: (line) => {
            throw new Error(line);
        },
    });
    const session = resolveTurnSession(await readAgentSession(agentDir), {
        generation: 1,
        harness: 'claude-agent-sdk',
        modelId: 'claude-opus-4-5',
    });
    const memory = planMemoryDelivery({
        content: context.memory,
        isResume,
        receipt: session.deliveredMemoryDigest,
    });
    const rules = planRulesDelivery({
        files: context.rules,
        isResume,
        receipts: session.deliveredRuleDigests,
    });
    const plan = isResume ? ({ kind: 'current' } as const) : ({ kind: 'fresh' } as const);
    await writeAgentSession(
        agentDir,
        sessionAfterTurn({
            composedFingerprint: 'composed',
            memory,
            nativeSessionId: 'native-1',
            outcome: 'completed',
            plan,
            rules,
            session,
            turn: { bootstrapFingerprint: 'boot', compacted: false },
        })
    );
    return composeTurnPrompt({
        instructions: plan,
        memoryBlock: memory.block,
        rulesBlock: rules.block,
        skillNotice: context.skillNotice,
        turnContent: 'Start.',
    });
}
