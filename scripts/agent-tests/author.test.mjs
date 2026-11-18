import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { agentSendAttempts, agentWorkspacePath, computerAttachmentPath } from './author.mjs';

describe('agentSendAttempts', () => {
    test('sends the content first, then retries a held send as a content-free draft send', () => {
        const [first, retry] = agentSendAttempts({
            content: 'Lane A is done.',
            nonce: 'agenttests_1',
            target: '#product',
        });
        expect(first).toEqual({
            content: 'Lane A is done.',
            nonce: 'agenttests_1',
            sendDraft: false,
            target: '#product',
        });
        // The Server refuses a draft send with content (SEND_DRAFT_STDIN_UNSUPPORTED).
        expect(retry).toEqual({ nonce: 'agenttests_1', sendDraft: true, target: '#product' });
        expect(retry).not.toHaveProperty('content');
    });

    test('names the inline-reply parent on the first send only', () => {
        const [first, retry] = agentSendAttempts({
            content: 'Not yet.',
            nonce: 'agenttests_2',
            replyToMessageId: 'msg_parent',
            target: '#product',
        });
        expect(first.replyToMessageId).toBe('msg_parent');
        // The Server refuses --reply-to on a draft send; the saved draft keeps it.
        expect(retry).not.toHaveProperty('replyToMessageId');
    });
});

describe('agentWorkspacePath', () => {
    test('resolves under the dev Computer data root, beside the attachment', () => {
        const options = { repositoryRoot: '/repo', serverId: 'srv_1' };
        const workspace = agentWorkspacePath({ ...options, agentId: 'agt_1' });
        const attachment = computerAttachmentPath(options);
        expect(workspace).toBe(path.join(path.dirname(attachment), 'agents', 'agt_1', 'workspace'));
    });
});
