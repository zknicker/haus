import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatChannelRelationshipLabel,
    getSessionRelationshipName,
} from './session-relationship.ts';

test('formats incoming spawned session relationships', () => {
    assert.equal(
        formatChannelRelationshipLabel({
            direction: 'incoming',
            edgeType: 'session_spawns_session',
            id: 'relationship-1',
            occurredAt: '2026-03-24T13:01:39.388Z',
            relatedSession: {
                agentId: 'tiny',
                key: 'agent:tiny:cron:job-1',
                name: 'Etsy Daily Check-In',
                platform: null,
                source: 'Cron: Etsy Daily Check-In',
                title: 'Cron: Etsy Daily Check-In',
                type: 'cron',
            },
            sourceToolCallId: 'call-1',
        }),
        'Spawned By'
    );
    assert.equal(
        getSessionRelationshipName({
            direction: 'incoming',
            edgeType: 'session_spawns_session',
            id: 'relationship-1',
            occurredAt: '2026-03-24T13:01:39.388Z',
            relatedSession: {
                agentId: 'tiny',
                key: 'agent:tiny:cron:job-1',
                name: 'Etsy Daily Check-In',
                platform: null,
                source: 'Cron: Etsy Daily Check-In',
                title: 'Cron: Etsy Daily Check-In',
                type: 'cron',
            },
            sourceToolCallId: 'call-1',
        }),
        'Etsy Daily Check-In'
    );
});

test('formats outgoing spawned session relationships', () => {
    assert.equal(
        formatChannelRelationshipLabel({
            direction: 'outgoing',
            edgeType: 'session_spawns_session',
            id: 'relationship-2',
            occurredAt: '2026-03-24T13:01:39.388Z',
            relatedSession: {
                agentId: 'codex',
                key: 'agent:codex:acp:child-1',
                name: '[Tue 2026-03-24 09:01 EDT] Run this exact command in...',
                platform: null,
                source: '[Tue 2026-03-24 09:01 EDT] Run this exact command in...',
                title: '[Tue 2026-03-24 09:01 EDT] Run this exact command in...',
                type: 'chat',
            },
            sourceToolCallId: 'call-2',
        }),
        'Spawned Session'
    );
});
