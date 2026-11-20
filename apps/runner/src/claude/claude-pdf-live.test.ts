import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';

const liveTest = process.env.HAUS_RUN_LIVE_RUNNER_CLAUDE_TEST === '1' ? test : test.skip;
const root = await mkdtemp(join(tmpdir(), 'haus-runner-pdf-'));
afterAll(() => rm(root, { force: true, recursive: true }));
const fixture = join(
    dirname(fileURLToPath(import.meta.resolve('@haus/computer/package.json'))),
    'src/invocations/fixtures/two-pages.pdf'
);

liveTest(
    'an SDK MCP tool result cannot carry a PDF to the model, so Claude gets its text',
    async () => {
        const blob = (await readFile(fixture)).toString('base64');
        const haus = createSdkMcpServer({
            alwaysLoad: true,
            name: 'haus',
            tools: [
                tool('read_report', 'Return the report document.', {}, async () => ({
                    content: [
                        {
                            resource: {
                                blob,
                                mimeType: 'application/pdf',
                                uri: 'file:///report.pdf',
                            },
                            type: 'resource',
                        },
                    ],
                })),
            ],
        });
        const messages = query({
            options: {
                allowedTools: ['mcp__haus__read_report'],
                cwd: root,
                env: { HOME: process.env.HOME, PATH: process.env.PATH, USER: process.env.USER },
                maxTurns: 3,
                mcpServers: { haus },
                model: 'claude-haiku-4-5',
                permissionMode: 'dontAsk',
                settingSources: [],
                strictMcpConfig: true,
                systemPrompt: 'You are a test agent.',
                tools: [],
            },
            prompt: 'Call read_report, then reply with the animal named on page one and the animal named on page two, nothing else.',
        });
        const toolResults: unknown[] = [];
        for await (const message of messages) {
            if (message.type === 'user') {
                toolResults.push(message.message.content);
            }
        }
        expect(JSON.stringify(toolResults)).toContain(
            '[Resource from haus at file:///report.pdf] Binary content (application/pdf, 895 bytes) saved to '
        );
    }
);
