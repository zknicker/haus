import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHostToolServer } from '../../../host-tools/mcp-server.ts';
import { resolveClaudeCredentials } from '../claude-credentials.ts';
import {
    buildClaudeArgs,
    buildClaudeEnv,
    hostToolToken,
    renderClaudeMcpConfig,
    writeClaudeLaunchFiles,
} from '../claude-launch.ts';
import { type CaptureStep, captureScenarios, captureTools } from './capture-scenarios.ts';
import { scrubFixtureLine } from './fixture-scrub.ts';

/**
 * Records a real Claude Code stream for one scenario, launched exactly as the driver launches it,
 * into `fixtures/<scenario>.jsonl` (specs/runtime-drivers.md "Recording fixtures").
 *
 *   bun apps/computer/src/runtime/claude-code/fixtures/capture.ts <scenario> <claude-binary>
 */
const [scenarioName, binaryPath] = process.argv.slice(2);
const scenario = scenarioName ? captureScenarios[scenarioName] : undefined;
if (!(scenario && binaryPath)) {
    throw new Error(
        `Usage: capture.ts <${Object.keys(captureScenarios).join('|')}> <claude-binary>`
    );
}

const root = await mkdtemp(join(tmpdir(), 'haus-claude-capture-'));
const homeDir = join(root, 'home');
const workspaceDir = join(root, 'workspace');
await mkdir(homeDir, { recursive: true });
await mkdir(workspaceDir, { recursive: true });
await writeFile(join(workspaceDir, 'notes.txt'), 'alpha\nbeta\ngamma\n');
const server = startHostToolServer();
const hostSession = server.openSession(captureTools);
const files = await writeClaudeLaunchFiles({
    dir: join(homeDir, '.haus-runtime'),
    instructions: 'You are a Haus test Agent. Follow the user exactly and keep replies short.',
    mcpConfig: renderClaudeMcpConfig(hostSession.mcp),
});
const credentials = scenario.authenticated
    ? await resolveClaudeCredentials({ env: process.env })
    : {};
const records: string[] = [];
const started = Date.now();
let claudeSessionId: string | undefined;

for (const [index, run] of scenario.processes.entries()) {
    const args = buildClaudeArgs({
        binaryPath,
        ...files,
        modelId: scenario.modelId ?? 'claude-haiku-4-5',
        reasoningEffort: 'default',
        ...(run.resume === 'previous' && claudeSessionId
            ? { resumeSessionId: claudeSessionId }
            : run.resume === 'missing'
              ? { resumeSessionId: randomUUID() }
              : {}),
    });
    const child = spawn(binaryPath, args, {
        cwd: workspaceDir,
        env: buildClaudeEnv({
            base: { PATH: process.env.PATH, USER: process.env.USER },
            credentials,
            homeDir,
            hostToolToken: hostToolToken(hostSession.mcp),
            launchEnv: {},
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const messages = recordProcess(child, index);
    for (const step of run.steps) {
        await runStep(step, child, messages, index);
    }
    claudeSessionId = messages.sessionId ?? claudeSessionId;
}

hostSession.close();
await server.stop();
const target = join(import.meta.dir, `${scenarioName}.jsonl`);
await writeFile(
    target,
    `${records.map((line) => scrubFixtureLine(line, { homeDir, root, workspaceDir })).join('\n')}\n`
);
// Only after scrubbing, which resolves the capture paths' real spellings.
await rm(root, { force: true, recursive: true });
process.stdout.write(`Recorded ${records.length} lines to ${target}\n`);

interface ProcessMessages {
    exited: Promise<number | null>;
    seen: Record<string, unknown>[];
    sessionId?: string;
    waiters: Set<() => void>;
}

function recordProcess(child: ChildProcessWithoutNullStreams, index: number): ProcessMessages {
    const state: ProcessMessages = {
        exited: new Promise((resolve) => child.once('close', (code) => resolve(code))),
        seen: [],
        waiters: new Set(),
    };
    const record = (stream: string, line: string) =>
        records.push(JSON.stringify({ line, process: index, stream, t: Date.now() - started }));
    lines(child.stdout, (line) => {
        record('stdout', line);
        try {
            const message = JSON.parse(line) as Record<string, unknown>;
            state.seen.push(message);
            if (typeof message.session_id === 'string') {
                state.sessionId = message.session_id;
            }
        } catch {
            // Non-JSON stdout is recorded verbatim; the normalizer must tolerate it too.
        }
        for (const wake of state.waiters) {
            wake();
        }
    });
    lines(child.stderr, (line) => record('stderr', line));
    void state.exited.then((code) => {
        record('exit', String(code));
        for (const wake of state.waiters) {
            wake();
        }
    });
    return state;
}

async function runStep(
    step: CaptureStep,
    child: ChildProcessWithoutNullStreams,
    messages: ProcessMessages,
    index: number
) {
    const write = (payload: Record<string, unknown>) => {
        const line = JSON.stringify(payload);
        records.push(
            JSON.stringify({ line, process: index, stream: 'stdin', t: Date.now() - started })
        );
        child.stdin.write(`${line}\n`);
    };
    switch (step.kind) {
        case 'send':
            write({
                message: { content: [{ text: step.text, type: 'text' }], role: 'user' },
                parent_tool_use_id: null,
                type: 'user',
                ...(step.priority ? { priority: step.priority } : {}),
                ...(step.uuid ? { uuid: randomUUID() } : {}),
            });
            return;
        case 'control':
            write({ request: step.request, request_id: randomUUID(), type: 'control_request' });
            return;
        case 'sleep':
            await Bun.sleep(step.ms);
            return;
        case 'until':
            await waitFor(messages, step.match, step.timeoutMs ?? 180_000);
            return;
        case 'end':
            child.stdin.end();
            await Promise.race([messages.exited, Bun.sleep(30_000)]);
            child.kill('SIGKILL');
            return;
        default:
            throw new Error('Unknown capture step.');
    }
}

function waitFor(
    messages: ProcessMessages,
    match: (seen: readonly Record<string, unknown>[]) => boolean,
    timeoutMs: number
): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            messages.waiters.delete(check);
            reject(new Error('Capture step timed out.'));
        }, timeoutMs);
        const check = () => {
            if (match(messages.seen)) {
                clearTimeout(timer);
                messages.waiters.delete(check);
                resolve();
            }
        };
        messages.waiters.add(check);
        void messages.exited.then(check);
        check();
    });
}

function lines(stream: NodeJS.ReadableStream, onLine: (line: string) => void) {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
        buffer += chunk;
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (line.length > 0) {
                onLine(line);
            }
            newline = buffer.indexOf('\n');
        }
    });
}
