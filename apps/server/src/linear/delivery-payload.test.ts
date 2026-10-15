import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Payload, readDataChange, readSessionEvent } from './delivery-payload.ts';

// The readers against provisional fixtures and real captures
// (apps/server/test/fixtures/linear/captured/).

function fixture(name: string): Payload {
    const path = join(import.meta.dir, '../../test/fixtures/linear', `${name}.json`);
    return JSON.parse(readFileSync(path, 'utf8')) as Payload;
}

function captured(name: string): Payload {
    return (fixture(`captured/${name}`) as { body: Payload }).body;
}

test('a captured mention reads its issue, the person’s comment, and the issue’s label names', () => {
    expect(readSessionEvent(captured('agent-session-created-mention'))).toEqual({
        action: 'created',
        appUserId: 'ea30be86-13ea-4566-9ef5-1b8a0f411298',
        causedBy: 'e007ac3a-dfb1-4742-8476-59a5e053fb35',
        guidance: null,
        issue: {
            delegateId: null,
            id: '504fbafc-ae10-46e7-a8c7-abec6c3a8643',
            identifier: 'HTST-11',
            state: null,
            teamId: '2227a3da-2fc4-4664-a722-5d178d44f312',
            title: 'Fixture: design HTST',
            url: 'https://linear.app/haus-chat/issue/HTST-11/fixture-design-htst',
        },
        issueLabelNames: ['Agent › Juniper'],
        linearSessionId: 'e516dcd3-24bf-46cd-a928-112bffcb36d5',
        mentioned: true,
        prompt: '@hausdev  Juniper, please draft three colourway prompts for this design.',
        promptContext: expect.stringContaining('<title>Fixture: design HTST</title>'),
        signal: null,
    });
});

test('delegated and proactive sessions are not mentions and ignore Linear’s placeholder comment', () => {
    for (const name of ['agent-session-created-delegation', 'agent-session-created-proactive']) {
        expect(readSessionEvent(captured(name))).toMatchObject({
            action: 'created',
            mentioned: false,
            prompt: null,
            signal: null,
        });
    }
    expect(readSessionEvent(captured('agent-session-created-delegation'))?.issueLabelNames).toEqual(
        ['Agent › Juniper']
    );
    expect(readSessionEvent(captured('agent-session-created-proactive'))?.issueLabelNames).toEqual(
        []
    );
});

test('a captured follow-up reads the new prompt and who sent it; a stop reads its signal', () => {
    expect(readSessionEvent(captured('agent-session-prompted'))).toMatchObject({
        action: 'prompted',
        causedBy: 'e007ac3a-dfb1-4742-8476-59a5e053fb35',
        prompt: 'Start with the sunset colourway.',
        signal: null,
    });
    expect(readSessionEvent(captured('agent-session-prompted-stop'))).toMatchObject({
        action: 'prompted',
        prompt: 'stop',
        signal: 'stop',
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
