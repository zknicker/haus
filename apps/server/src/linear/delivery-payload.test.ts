import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Payload, readDataChange, readSessionEvent } from './delivery-payload.ts';

// The readers against the provisional fixtures (apps/server/test/fixtures/linear/README.md).

function fixture(name: string): Payload {
    const path = join(import.meta.dir, '../../test/fixtures/linear', `${name}.json`);
    return JSON.parse(readFileSync(path, 'utf8')) as Payload;
}

test('a mention-created session reads its issue, prompt, context, and guidance', () => {
    expect(readSessionEvent(fixture('agent-session-created'))).toEqual({
        action: 'created',
        appUserId: 'app-user-haus',
        causedBy: 'user-zach',
        guidance: 'Keep designs on brand.',
        issue: {
            delegateId: null,
            id: 'issue-fixture-142',
            identifier: 'DES-142',
            labelIds: ['label-agent-juniper'],
            state: 'Design Review',
            teamId: 'team-des',
            title: 'Moth tee',
            url: 'https://linear.app/haus-chat/issue/DES-142/moth-tee',
        },
        linearSessionId: 'session-fixture-1',
        mentioned: true,
        prompt: '@haus Juniper can you take this one?',
        promptContext: expect.stringContaining('<title>Moth tee</title>'),
    });
});

test('a follow-up reads the new prompt and who sent it', () => {
    const facts = readSessionEvent(fixture('agent-session-prompted'));
    expect(facts).toMatchObject({
        action: 'prompted',
        causedBy: 'user-zach',
        mentioned: false,
        prompt: 'Also try a navy version.',
    });
});

test('an Issue update reads the actor, the change time, and what it changed from', () => {
    const change = readDataChange(fixture('issue-label-update'));
    expect(change).toMatchObject({
        actorId: 'user-zach',
        entityId: 'issue-fixture-142',
        updatedAt: new Date('2026-10-15T11:59:59.000Z'),
        updatedFrom: { labelIds: ['label-agent-juniper'] },
    });
});

test('a session event without a session or issue is malformed', () => {
    expect(readSessionEvent({ action: 'created', agentSession: { id: 's' } })).toBeNull();
    expect(readSessionEvent({ action: 'created' })).toBeNull();
    expect(readDataChange({ data: {} })).toBeNull();
});
