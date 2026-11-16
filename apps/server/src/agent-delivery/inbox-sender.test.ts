import { expect, test } from 'bun:test';
import { inboxSender } from './inbox-sender.ts';

test('Trigger problem notices and claim assignments speak as the Haus system sender', () => {
    for (const source of ['trigger_problem', 'claim_assignment', 'image_generation_failed']) {
        expect(inboxSender({ attention: false, source, target: '#all' })).toEqual({
            senderHandle: 'haus',
            senderType: 'system',
        });
    }
    expect(inboxSender({ attention: false, source: 'trigger', target: '#all' })).toEqual({
        senderHandle: 'trigger',
        senderType: 'trigger',
    });
});
