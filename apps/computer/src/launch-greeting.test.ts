import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import { parseStartCommand } from './agent-command-frames.ts';
import { disposeServerLaunchHosts } from './agent-launch-host.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import type { HarnessAgentFactory } from './harness/executor.ts';
import { type AgentStartCommand, type Attachment, runAgentLaunch } from './launch.ts';

// Raft db5e399's agentic #all greeting; turn-prompt.test.ts pins the full text.
const greetingLead =
    'Post one short, natural self-introduction to #all so the team knows who you are and what you can help with.';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let dataRoot: string;
let server: ReturnType<typeof Bun.serve>;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-launch-greeting-'));
    server = Bun.serve({
        fetch: (request) => {
            const path = new URL(request.url).pathname;
            if (path === '/computer/runner/mint') {
                return Response.json({
                    runnerId: 'arc_greeting00000000',
                    runnerToken: `grtr_${'g'.repeat(43)}`,
                });
            }
            if (path === '/computer/runner/revoke') {
                return Response.json({ revoked: true });
            }
            if (path === '/api/agent/mcp/tools') {
                return Response.json({ tools: [] });
            }
            return new Response('not found', { status: 404 });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
});

afterEach(async () => {
    disposeServerLaunchHosts('srv_greeting');
    server.stop(true);
    await rm(dataRoot, { force: true, recursive: true });
});

test('the start frame carries the greeting the Server attached to the run', () => {
    expect(parseStartCommand({ ...wakeFrame(), greets: true })?.greets).toBe(true);
    expect(parseStartCommand(wakeFrame())?.greets).toBeUndefined();
    expect(parseStartCommand({ ...wakeFrame(), greets: 'yes' })).toBeNull();
});

test('an App-created Agent with no brief greets on the run the Server attached its greeting to', async () => {
    // No agent-configure ran, so there is no seeded brief: the Server's flag alone decides.
    const first = await launchPrompt({ ...wakeFrame(), greets: true });
    expect(first).toStartWith(`Start.\n${greetingLead}`);

    // A greeting that rides a later generation's cold start shows beside the reset line.
    const reset = await launchPrompt({ ...wakeFrame(), greets: true, sessionGeneration: 2 });
    expect(reset).toStartWith('Start.\nFresh session:');
    expect(reset).toContain(greetingLead);

    // A first turn the Server did not attach a greeting to never greets.
    expect(await launchPrompt(wakeFrame())).not.toContain(greetingLead);
});

function wakeFrame(): AgentStartCommand & Record<string, unknown> {
    return {
        agentId: 'agt_greeting',
        chatId: 'cht_all',
        inbox: [],
        inboxDelivery: 'notice',
        modelId: 'gpt-5.6-sol',
        runId: `run_greeting_${crypto.randomUUID().slice(0, 8)}`,
        runtimeId: 'codex',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    };
}

/** Runs one cold-start turn through the real launch and returns the prompt the model saw. */
async function launchPrompt(frame: Record<string, unknown>): Promise<string> {
    const command = parseStartCommand(frame);
    if (!command) {
        throw new Error('The test start frame did not parse.');
    }
    const prompts: string[] = [];
    const harnessAgentFactory: HarnessAgentFactory = () => ({
        createSession: (async () => ({
            detach: async () => ({ data: {}, harnessId: 'fake', type: 'resume-session' }),
            destroy: async () => undefined,
            isResume: false,
            sessionId: 'greeting-session',
        })) as unknown as HarnessAgent['createSession'],
        stream: (async (input: { prompt: unknown }) => {
            prompts.push(promptText(input.prompt));
            return { fullStream: (async function* () {})() };
        }) as unknown as HarnessAgent['stream'],
    });
    const attachment: Attachment = {
        computerId: 'cmp_greeting00000000',
        credential: 'launch-greeting-credential',
        serverOrigin: `http://127.0.0.1:${server.port}`,
        serverId: 'srv_greeting',
        slug: 'launch-greeting',
    };
    await runAgentLaunch({
        attachment,
        command,
        dataRoot,
        harnessAgentFactory,
        runtime,
        sendFrame: () => undefined,
        serverOrigin: attachment.serverOrigin,
    });
    const [prompt] = prompts;
    if (prompt === undefined) {
        throw new Error('The launch never prompted the model.');
    }
    return prompt;
}

function promptText(prompt: unknown): string {
    return typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
}
