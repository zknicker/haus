import { expect, test } from 'bun:test';
import { createBrowserTools, validateBrowserCommand } from './agent-tool.ts';

test('browser commands cannot replace the selected connection or close the shared browser', () => {
    for (const args of [
        ['close'],
        ['connect', '9222'],
        ['open', '-p', 'browserbase'],
        ['open', '--engine=lightpanda'],
        ['open', 'https://example.com', '--cdp=9222'],
        ['tab', 'close', '--all'],
        ['open', '--config', '/other'],
    ]) {
        expect(() => validateBrowserCommand(args)).toThrow();
    }
    expect(() => validateBrowserCommand(['tab', 'new', 'https://example.com'])).not.toThrow();
    expect(() => validateBrowserCommand(['snapshot', '-i'])).not.toThrow();
});

test('the agent browser tool fails closed when no browser belongs to its attachment', async () => {
    const tool = createBrowserTools({ agentId: 'agent', root: '/no-browser' }).browser;
    if (!tool?.execute) {
        throw new Error('Browser tool missing');
    }
    await expect(
        tool.execute(
            { args: ['snapshot'] },
            { toolCallId: 'test', messages: [], context: undefined }
        )
    ).rejects.toThrow('disabled or unavailable');
});
