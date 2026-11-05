import { describe, expect, test } from 'bun:test';
import type { McpPreset } from '@haus/api';
import { signGithubToolCall } from './agent-signature.ts';

const signature = '<sub>Posted by Forge via Haus</sub>';

function sign(
    toolName: string,
    args: Record<string, unknown>,
    preset: McpPreset | null = 'github'
) {
    return signGithubToolCall({
        args,
        readAgentName: () => Promise.resolve('Forge'),
        readPreset: () => Promise.resolve(preset),
        toolName,
    });
}

describe('signGithubToolCall', () => {
    test('names the Agent under text it writes', async () => {
        const signed = await sign('add_issue_comment', { body: 'Looks good.\n', owner: 'o' });
        expect(signed).toEqual({ body: `Looks good.\n\n${signature}`, owner: 'o' });
    });

    test('does not sign twice when an edit sends the text back', async () => {
        const args = { body: `Looks good.\n\n${signature}\n` };
        expect(await sign('update_pull_request', args)).toBe(args);
    });

    test('leaves calls with no text alone', async () => {
        const args = { event: 'APPROVE', method: 'submit_pending' };
        expect(await sign('pull_request_review_write', args)).toBe(args);
        const blank = { body: '  ' };
        expect(await sign('pull_request_review_write', blank)).toBe(blank);
    });

    test('leaves other tools and connections alone', async () => {
        const args = { body: 'text' };
        expect(await sign('create_gist', args)).toBe(args);
        expect(await sign('add_issue_comment', args, 'cloudflare')).toBe(args);
    });
});
