import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import * as z from 'zod';

const setupToken = process.env.HAUS_RUNNER_CLAUDE_SETUP_TOKEN;
const liveTest = process.env.HAUS_RUN_LIVE_RUNNER_CLAUDE_TEST === '1' ? test : test.skip;
const root = await mkdtemp(join(tmpdir(), 'haus-runner-sdk-'));
afterAll(() => rm(root, { force: true, recursive: true }));

liveTest('the SDK runs with native tools off and only mcp__haus__* tools reachable', async () => {
    const nonce = crypto.randomUUID().slice(0, 8);
    const commands: string[] = [];
    const haus = createSdkMcpServer({
        alwaysLoad: true,
        name: 'haus',
        tools: [
            tool(
                'bash',
                'Run a shell command on the Agent machine.',
                { command: z.string() },
                async ({ command }) => {
                    commands.push(command);
                    return { content: [{ text: `bridged:${nonce}`, type: 'text' }] };
                }
            ),
        ],
    });
    const messages = query({
        options: {
            allowedTools: ['mcp__haus__bash', 'WebSearch', 'WebFetch'],
            cwd: root,
            env: loginEnv(),
            maxTurns: 4,
            mcpServers: { haus },
            model: 'claude-haiku-4-5',
            permissionMode: 'dontAsk',
            settingSources: [],
            strictMcpConfig: true,
            systemPrompt: 'You are a test agent. Use the bash tool when asked to run a command.',
            tools: ['WebSearch', 'WebFetch'],
        },
        prompt: `Run \`echo ${nonce}\` with the bash tool, then reply with exactly what the tool returned.`,
    });
    let initTools: string[] = [];
    let finalText = '';
    for await (const message of messages) {
        if (message.type === 'system' && message.subtype === 'init') {
            initTools = message.tools;
        }
        if (message.type === 'result' && message.subtype === 'success') {
            finalText = message.result;
        }
    }
    expect(initTools.toSorted()).toEqual(['WebFetch', 'WebSearch', 'mcp__haus__bash']);
    expect(commands).toEqual([`echo ${nonce}`]);
    expect(finalText).toContain(`bridged:${nonce}`);
    if (setupToken) {
        expect(await readdir(join(root, 'claude', 'projects'))).toHaveLength(1);
    }
});

function loginEnv() {
    if (setupToken) {
        return {
            CLAUDE_CODE_OAUTH_TOKEN: setupToken,
            CLAUDE_CONFIG_DIR: join(root, 'claude'),
            HOME: root,
            PATH: process.env.PATH,
        };
    }
    return { HOME: process.env.HOME, PATH: process.env.PATH, USER: process.env.USER };
}
