import { describe, expect, test } from 'bun:test';
import { type LinearIssueView, parseLinearIssueUrl } from '@haus/api';
import { linearIssueReadMatches } from '../../hooks/linear/linear-issue-change.ts';
import { linearChipState, linearIssueHoverModel, linearIssueNotice } from './linear-issue-model.ts';

const issueUrl = parseLinearIssueUrl('https://linear.app/haus/issue/DES-142/new-mockup');
if (!issueUrl) {
    throw new Error('fixture URL must parse');
}
const parsed = issueUrl;
const now = Date.parse('2026-10-15T12:00:00.000Z');

const view: LinearIssueView = {
    assignee: { id: 'user-1', name: 'Zach' },
    delegateAgentId: 'agent_juniper',
    id: 'issue-1',
    identifier: 'DES-142',
    labels: [{ color: '#aabbcc', id: 'label-1', name: 'Agent' }],
    lastAgentChange: {
        agentId: 'agent_juniper',
        changedAt: '2026-10-15T09:00:00.000Z',
        summary: 'Updated issue',
    },
    state: { color: '#00ff00', id: 'state-1', name: 'In Review' },
    thumbnailUrl: null,
    title: 'New mockup',
    url: 'https://linear.app/haus/issue/DES-142/new-mockup',
};

describe('linearChipState', () => {
    test('a Server without Linear, or an unconnected workspace, keeps the plain link', () => {
        expect(
            linearChipState(parsed, { data: undefined, enabled: false, isError: false })
        ).toEqual({
            kind: 'plain',
        });
        expect(
            linearChipState(parsed, {
                data: { reason: 'workspace_not_connected', status: 'unavailable' },
                enabled: true,
                isError: false,
            }).kind
        ).toBe('plain');
    });

    test('the key from the URL labels the chip until the issue arrives', () => {
        expect(linearChipState(parsed, { data: undefined, enabled: true, isError: false })).toEqual(
            {
                kind: 'issue',
                label: 'DES-142',
                pending: true,
                view: null,
            }
        );
        const ready = linearChipState(parsed, {
            data: { issue: view, status: 'available' },
            enabled: true,
            isError: false,
        });
        expect(ready).toMatchObject({ label: 'DES-142 New mockup', pending: false });
    });

    test('a missing issue keeps its chip and explains itself', () => {
        const data = { reason: 'issue_not_found', status: 'unavailable' } as const;
        expect(linearChipState(parsed, { data, enabled: true, isError: false })).toMatchObject({
            label: 'DES-142',
            pending: false,
        });
        expect(linearIssueNotice(data, false)).toContain('no issue');
        expect(linearIssueNotice(undefined, false)).toBeNull();
    });
});

describe('linearIssueHoverModel', () => {
    test('names the delegate Agent and its latest change', () => {
        const juniper = { avatarUrl: null, displayName: 'Juniper', id: 'agent_juniper' };
        const model = linearIssueHoverModel(view, [juniper], now);
        expect(model.delegate).toEqual(juniper);
        expect(model.assignee).toBe('Zach');
        expect(model.lastChange).toBe('Juniper updated issue · 3h ago');
    });

    test('an unknown Agent still reads, and an untitled issue falls back to its key', () => {
        const model = linearIssueHoverModel({ ...view, title: '' }, [], now);
        expect(model.delegate).toBeNull();
        expect(model.lastChange?.startsWith('An Agent ')).toBe(true);
        expect(model.title).toBe('DES-142');
    });
});

describe('linearIssueReadMatches', () => {
    const event = { identifier: 'DES-142', issueId: 'issue-1', serverId: 'srv_1' };

    test('matches by the issue id a read holds, or by the key its URL names', () => {
        const input = { serverId: 'srv_1', url: parsed.url };
        expect(linearIssueReadMatches(input, undefined, event)).toBe(true);
        const other = { serverId: 'srv_1', url: 'https://linear.app/haus/issue/DES-7' };
        expect(
            linearIssueReadMatches(
                other,
                { issue: { ...view, id: 'issue-1' }, status: 'available' },
                event
            )
        ).toBe(true);
        expect(linearIssueReadMatches(other, undefined, event)).toBe(false);
        expect(linearIssueReadMatches({ ...input, serverId: 'srv_2' }, undefined, event)).toBe(
            false
        );
    });
});
