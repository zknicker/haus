/**
 * Records Codex driver fixtures from the real pinned app-server: every stdin write and stdout
 * line, with relative timing, launched exactly as the driver launches it. Spends real Codex
 * quota. Run from the repository root:
 *   bun apps/computer/src/runtime/codex/fixtures/capture-fixtures.ts [scenario ...]
 */
import { appendFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { defineHostTool } from '../../../host-tools/host-tool.ts';
import { startHostToolServer } from '../../../host-tools/mcp-server.ts';
import type { RuntimeSession } from '../../driver.ts';
import type { TurnEvent } from '../../turn-event.ts';
import { createCodexDriver } from '../codex-driver.ts';
import { type CodexTransport, spawnCodexProcess } from '../codex-transport.ts';
import { testWarmPool } from '../testing/replay-driver.ts';
import { type CaptureStep, captureScenarios } from './capture-scenarios.ts';

const model = process.env.HAUS_LIVE_CODEX_MODEL ?? 'gpt-5.6-luna';
const fixturesDir = import.meta.dir;
const wanted = new Set(process.argv.slice(2));

const server = startHostToolServer();
const probe = defineHostTool({
    description: 'Returns the Haus probe code.',
    execute: () => Promise.resolve({ text: 'PROBE-7731', type: 'text' }),
    inputSchema: z.object({}),
    name: 'haus_probe',
});

for (const scenario of captureScenarios) {
    if (wanted.size > 0 && !wanted.has(scenario.name)) {
        continue;
    }
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-fixture-')));
    const output = join(fixturesDir, `${scenario.name}.jsonl`);
    await writeFile(output, '');
    const started = Date.now();
    let processIndex = 0;
    // Synchronous, so the file keeps the exact order lines crossed the pipe.
    const record = (direction: 'in' | 'out', line: string) =>
        appendFileSync(
            output,
            `${JSON.stringify({ dir: direction, line: scrub(line, root), proc: processIndex, t: Date.now() - started })}\n`
        );
    await mkdir(join(root, 'workspace'), { recursive: true });
    const driver = createCodexDriver({
        env: {},
        warm: { key: root, pool: testWarmPool },
        homeDir: join(root, 'home'),
        hostHomeDir: scenario.loggedOut ? join(root, 'logged-out-host') : homedir(),
        hostToolServer: server,
        instructions: 'You are a Haus test Agent. Follow the user exactly.',
        modelId: scenario.model ?? model,
        reasoningEffort: 'low',
        spawn: (launch) => {
            processIndex += 1;
            return recording(spawnCodexProcess(launch), record);
        },
        tools: [probe],
        workspaceDir: join(root, 'workspace'),
    });
    let session: RuntimeSession | undefined;
    const log: string[] = [];
    try {
        for (const step of scenario.steps) {
            session = await runStep(step, session, driver, log);
        }
        console.log(`${scenario.name}: ${log.join(' | ')}`);
    } catch (error) {
        console.log(
            `${scenario.name}: threw ${error instanceof Error ? error.message : String(error)}`
        );
    } finally {
        await session?.destroy();
        await rm(root, { force: true, recursive: true });
    }
}
await server.stop();

async function runStep(
    step: CaptureStep,
    session: RuntimeSession | undefined,
    driver: ReturnType<typeof createCodexDriver>,
    log: string[]
): Promise<RuntimeSession | undefined> {
    switch (step.kind) {
        case 'open':
            return await driver.openSession({ resumeFrom: step.resumeFrom, sessionId: 'fixture' });
        case 'stop': {
            const state = await session?.stop();
            return await driver.openSession({ resumeFrom: state, sessionId: 'fixture' });
        }
        case 'turn': {
            if (!session) {
                throw new Error('No session to run a turn on.');
            }
            const abort = new AbortController();
            const turn = await session.startTurn({ prompt: step.prompt, signal: abort.signal });
            const types: string[] = [];
            let acted = false;
            for await (const event of turn.events) {
                types.push(eventLabel(event));
                if (!acted && step.on && matches(step.on.event, event)) {
                    acted = true;
                    if (step.on.action === 'abort') {
                        abort.abort();
                    } else {
                        const result = await session.steer(step.on.text);
                        types.push(`steer:${result.delivered ? 'delivered' : result.reason}`);
                    }
                }
            }
            await turn.settle();
            log.push(types.filter((type) => type !== 'progress').join(','));
            return session;
        }
        default:
            return session;
    }
}

function matches(on: 'tool-call' | 'tool-result', event: TurnEvent): boolean {
    return event.type === on;
}

function eventLabel(event: TurnEvent): string {
    if (event.type === 'tool-call' || event.type === 'tool-result') {
        return `${event.type}:${event.toolName}`;
    }
    if (event.type === 'error') {
        return `error:${event.error instanceof Error ? event.error.message : String(event.error)}`;
    }
    return event.type;
}

function recording(
    transport: CodexTransport,
    record: (direction: 'in' | 'out', line: string) => void
): CodexTransport {
    transport.onLine((line) => record('out', line));
    return {
        exited: transport.exited,
        kill: () => transport.kill(),
        onLine: (listener) => transport.onLine(listener),
        stderrTail: () => transport.stderrTail(),
        write: (line) => {
            record('in', line);
            return transport.write(line);
        },
    };
}

/** Paths, the host name, installation ids, credit balances, and moderation payloads go. */
function scrub(line: string, root: string): string {
    let text = line;
    for (const [from, to] of [
        [`/private${root}`, '<root>'],
        [root, '<root>'],
        [homedir(), '<host-home>'],
        [hostname(), '<host>'],
    ] as const) {
        text = text.split(from).join(to);
    }
    const value = JSON.parse(text) as { method?: string; params?: Record<string, unknown> };
    if (value.method === 'turn/moderationMetadata' && value.params) {
        value.params.metadata = {};
    }
    if (value.method === 'remoteControl/status/changed' && value.params) {
        value.params.installationId = '<installation>';
    }
    const limits = value.params?.rateLimits as { credits?: { balance?: string } } | undefined;
    if (limits?.credits?.balance) {
        limits.credits.balance = '<balance>';
    }
    // A generated image inlines its PNG as base64.
    return JSON.stringify(value, (_key, field: unknown) =>
        typeof field === 'string' && field.length > 4096 ? '<base64>' : field
    );
}
