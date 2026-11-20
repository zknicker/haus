import { expect, test } from 'bun:test';
import type { ModelConnection } from '@haus/api';
import { renderWithTrpc } from '../../../../test-support/trpc-test-provider.tsx';
import { testConnection } from './model-connection.fixture.ts';
import { ModelConnectionProviders } from './model-connections-group.tsx';

const claude = testConnection({ id: 'mcn_team', label: 'Team plan' });
const gemini = testConnection({
    authKind: 'api-key',
    id: 'mcn_gemini',
    label: 'Gemini API key',
    provider: 'gemini',
    status: 'failed',
    statusDetail: 'API key not valid.',
    webSearch: true,
});

function render(connections: ModelConnection[], isOwner: boolean) {
    return renderWithTrpc(
        <ModelConnectionProviders connections={connections} isOwner={isOwner} serverId="srv_1" />
    );
}

function headings(html: string) {
    return [
        ...html.matchAll(
            /data-slot="item-card-content"><span class="item-card__title" data-slot="item-card-title">([^<]+)</gu
        ),
    ].map((match) => match[1]);
}

function count(html: string, text: string) {
    return html.split(text).length - 1;
}

test('one card per provider in product order, empty ones included', () => {
    expect(headings(render([gemini, claude], false))).toEqual([
        'Claude',
        'ChatGPT',
        'xAI',
        'Gemini',
        'OpenRouter',
    ]);
});

test('the Owner gets Connect on every card and a menu on every row; a member gets neither', () => {
    const owner = render([gemini, claude], true);
    expect(count(owner, '>Connect</button>')).toBe(5);
    expect(count(owner, 'aria-label="Team plan actions"')).toBe(1);
    expect(count(owner, 'aria-label="Gemini API key actions"')).toBe(1);

    const member = render([gemini, claude], false);
    expect(count(member, '>Connect</button>')).toBe(0);
    expect(count(member, ' actions"')).toBe(0);
});

test('each row reports its state, and a failure reads under it', () => {
    const html = render([gemini, claude], false);
    expect(html).toContain('Default · Connected');
    expect(html).toContain('Default · Failed');
    expect(html).toContain('API key not valid.');
});

test('web search shows on Gemini but not on Claude, and only the Owner can flip it', () => {
    const member = render([gemini, claude], false);
    expect(count(member, '<span class="label" data-slot="label">Web search</span>')).toBe(1);
    expect(count(member, 'aria-label="Web search for Gemini API key"')).toBe(1);
    expect(count(member, 'aria-label="Web search for Team plan"')).toBe(0);
    const memberSwitch = /<input aria-label="Web search for Gemini API key"[^>]*>/u.exec(
        member
    )?.[0];
    expect(memberSwitch).toContain('disabled=""');
    expect(memberSwitch).toContain('checked=""');
    const ownerSwitch = /<input aria-label="Web search for Gemini API key"[^>]*>/u.exec(
        render([gemini, claude], true)
    )?.[0];
    expect(ownerSwitch).not.toContain('disabled=""');
    expect(ownerSwitch).toContain('checked=""');
});

test('capacity draws a meter per window, and nothing until the runner reports it', () => {
    expect(count(render([claude], true), 'role="progressbar"')).toBe(0);
    const reported = render(
        [
            {
                ...claude,
                capacity: [
                    {
                        id: 'current-session',
                        label: '5h',
                        resetsAt: '2026-11-19T15:00:00.000Z',
                        usedPercent: 42,
                    },
                    {
                        id: 'current-week-all-models',
                        label: 'Weekly',
                        resetsAt: null,
                        usedPercent: 81.6,
                    },
                ],
            },
        ],
        true
    );
    expect(count(reported, 'role="progressbar"')).toBe(2);
    expect(reported).toContain('aria-label="Team plan 5h"');
    expect(reported).toContain('>42%<');
    expect(reported).toContain('>82%<');
});
