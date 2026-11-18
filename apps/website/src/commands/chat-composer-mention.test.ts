import { expect, test } from 'bun:test';
import { matchChatComposerMentionRequest } from './chat-composer-mention.ts';

test('mention requests are consumed only by their owning composer', () => {
    const request = {
        agentId: 'agent-1',
        composerId: 'chat-1:task:message-1',
    };

    expect(matchChatComposerMentionRequest(request, 'chat-1:task:message-1')).toEqual(request);
    expect(matchChatComposerMentionRequest(request, 'chat-1')).toBeNull();
});
