// Records Grok Build ACP fixtures from the installed `grok`, launched exactly as the driver does.
// Usage: bun apps/computer/src/runtime/grok/fixtures/capture.ts [scenario ...]
// Re-capture when a Grok upgrade changes its stream; the fixture diff is the review surface.
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../../../daemon-runtime.ts';
import { sandboxProcessOwner } from '../../../harness/sandbox-process-owner.ts';
import { startHostToolServer } from '../../../host-tools/mcp-server.ts';
import type { RuntimeResumeState } from '../../resume-state.ts';
import type { TurnEvent } from '../../turn-event.ts';
import { WarmProcessPool } from '../../warm-pool.ts';
import { createGrokDriver } from '../grok-driver.ts';
import { echoHostTool } from './echo-host-tool.ts';
import { createFixtureRecorder } from './fixture-recorder.ts';

type Recorder = ReturnType<typeof createFixtureRecorder>;
interface Context {
    driver(tap: Recorder | null, env?: Record<string, string>): ReturnType<typeof createGrokDriver>;
    recorder(): Recorder;
}

const scenarios: Record<string, (context: Context) => Promise<Recorder>> = {
    'auth-failure': async (context) => {
        const recorder = context.recorder();
        const proxy = 'https://cli-chat-proxy.grok.com/v1';
        const env = {
            GROK_CLI_CHAT_PROXY_BASE_URL: proxy,
            GROK_MODELS_BASE_URL: proxy,
            GROK_XAI_API_BASE_URL: proxy,
            PATH: process.env.PATH ?? '',
            XAI_API_KEY: 'xai-invalid-fixture-key',
        };
        // A rejected key empties Grok's model catalog, so the open fails at set_model.
        await turns(context.driver(recorder, env), undefined, ['Reply with exactly OK.']).then(
            () => log('auth-failure', 'unexpectedly opened'),
            (error: unknown) => log('auth-failure', String(error))
        );
        return recorder;
    },
    cancel: async (context) => {
        const recorder = context.recorder();
        const session = await context
            .driver(recorder)
            .openSession({ resumeFrom: undefined, sessionId: 'fixture' });
        const abort = new AbortController();
        const turn = await session.startTurn({
            prompt: 'Run the shell command `sleep 30`, then reply DONE.',
            signal: abort.signal,
        });
        await drain(turn.events, (event) => {
            if (event.type === 'tool-call') {
                setTimeout(() => abort.abort(new Error('fixture cancel')), 1000);
            }
        });
        await turn.settle();
        const after = await session.startTurn({
            prompt: 'Reply with exactly AFTER.',
            signal: new AbortController().signal,
        });
        await drain(after.events);
        await session.stop();
        return recorder;
    },
    edit: (context) =>
        single(
            context,
            'In notes.txt replace the line beta with gamma using your edit tool, then create new.txt containing "fresh". Reply DONE.'
        ),
    'host-tool': (context) =>
        single(
            context,
            'Find the haus echo tool with your tool search, call it with text "ping-mcp", and reply with exactly what it returned.'
        ),
    interject: async (context) => {
        const recorder = context.recorder();
        const session = await context
            .driver(recorder)
            .openSession({ resumeFrom: undefined, sessionId: 'fixture' });
        const turn = await session.startTurn({
            prompt: 'Run the shell command `sleep 6`. After it finishes, reply with exactly ORIGINAL and nothing else.',
            signal: new AbortController().signal,
        });
        let steered = false;
        await drain(turn.events, (event) => {
            if (event.type === 'tool-call' && !steered) {
                steered = true;
                void session
                    .steer('Change the final reply to exactly INTERJECTED and nothing else.')
                    .then((result) => log('steer', result));
            }
        });
        await session.stop();
        return recorder;
    },
    'missing-session': async (context) => {
        const recorder = context.recorder();
        const resumeFrom: RuntimeResumeState = {
            runtime: 'grok-build',
            sessionId: '01a15a09-0000-7000-8000-000000000000',
            version: 1,
        };
        await context
            .driver(recorder)
            .openSession({ resumeFrom, sessionId: 'fixture' })
            .then(
                () => log('missing-session', 'unexpectedly opened'),
                (error: unknown) => log('missing-session', String(error))
            );
        return recorder;
    },
    resume: async (context) => {
        const first = await turns(context.driver(null), undefined, [
            'Remember the codeword PAPAYA. Reply OK.',
        ]);
        const recorder = context.recorder();
        await turns(context.driver(recorder), first, ['What was the codeword? One word.']);
        return recorder;
    },
    shell: (context) =>
        single(
            context,
            'Run the shell command `echo hello-from-shell && exit 3` and then reply with its exit code as a digit.'
        ),
    text: (context) => single(context, 'Reply with exactly PONG.'),
};

async function single(context: Context, prompt: string): Promise<Recorder> {
    const recorder = context.recorder();
    await turns(context.driver(recorder), undefined, [prompt]);
    return recorder;
}

async function turns(
    driver: ReturnType<typeof createGrokDriver>,
    resumeFrom: RuntimeResumeState | undefined,
    prompts: string[]
): Promise<RuntimeResumeState> {
    const session = await driver.openSession({ resumeFrom, sessionId: 'fixture' });
    for (const prompt of prompts) {
        const turn = await session.startTurn({ prompt, signal: new AbortController().signal });
        await drain(turn.events);
    }
    return await session.stop();
}

async function drain(events: AsyncIterable<TurnEvent>, onEvent?: (event: TurnEvent) => void) {
    for await (const event of events) {
        if (
            event.type !== 'progress' &&
            event.type !== 'text-delta' &&
            event.type !== 'reasoning-delta'
        ) {
            log('event', JSON.stringify(event).slice(0, 240));
        }
        onEvent?.(event);
    }
}

function log(label: string, value: unknown) {
    process.stdout.write(
        `${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}\n`
    );
}

const runtime = makeDaemonRuntime();
const hostToolServer = startHostToolServer();
const warmPool = new WarmProcessPool({
    onCloseError: (error) => {
        throw error;
    },
});
const selected = process.argv.slice(2);
for (const name of selected.length > 0 ? selected : Object.keys(scenarios)) {
    const scenario = scenarios[name];
    if (!scenario) {
        throw new Error(`Unknown scenario ${name}.`);
    }
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-grok-fixture-')));
    const homeDir = join(root, 'home');
    const workspaceDir = join(root, 'workspace');
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(workspaceDir, 'notes.txt'), 'alpha\nbeta\n');
    const probe = hostToolServer.openSession([]);
    const mcpUrl = probe.mcp.url;
    probe.close();
    let token = '';
    const context: Context = {
        driver: (recorder, env) =>
            createGrokDriver({
                env: env ?? { PATH: process.env.PATH ?? '' },
                homeDir,
                hostToolServer: {
                    openSession: (tools) => {
                        const session = hostToolServer.openSession(tools);
                        token = session.mcp.headers.Authorization.slice('Bearer '.length);
                        return session;
                    },
                },
                instructions:
                    'You are a Haus test agent. Follow instructions exactly and keep replies short.\n',
                modelId: process.env.HAUS_LIVE_GROK_MODEL ?? 'grok-4.6',
                reasoningEffort: 'low',
                processes: sandboxProcessOwner(runtime),
                warm: { key: root, pool: warmPool },
                tools: [echoHostTool],
                wireTap: recorder ? (frame) => recorder.tap(frame) : undefined,
                workspaceDir,
            }),
        recorder: () =>
            createFixtureRecorder(() => ({
                homeDirs: [homeDir],
                mcpToken: token,
                mcpUrl,
                workspaceDirs: [workspaceDir],
            })),
    };
    log('scenario', name);
    const recorder = await scenario(context);
    await writeFile(join(import.meta.dir, `${name}.jsonl`), recorder.toJsonl());
}
await warmPool.close();
await hostToolServer.stop();
await runtime.dispose();
