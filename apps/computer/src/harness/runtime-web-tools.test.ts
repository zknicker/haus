import { expect, test } from 'bun:test';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import {
    inactiveWebToolSettings,
    matchExposedToolNames,
    resolveInactiveWebToolNames,
    webToolNames,
} from './runtime-web-tools.ts';

const claudeCodeToolNames = Object.keys(createClaudeCode({ effort: 'medium' }).builtinTools);

test('disables the web tools Claude Code actually exposes, in its own casing', () => {
    expect(
        resolveInactiveWebToolNames({ exposedToolNames: claudeCodeToolNames, webAccess: true })
    ).toEqual(['WebFetch']);
    expect(
        resolveInactiveWebToolNames({ exposedToolNames: claudeCodeToolNames, webAccess: false })
    ).toEqual(['webSearch', 'WebFetch']);
});

test('every gated web tool still exists in the Claude Code builtin tool set', () => {
    // A name the runtime does not expose is rejected at agent construction and
    // fails the turn, so both gates must keep resolving to a real builtin tool.
    for (const webToolName of Object.values(webToolNames)) {
        expect(
            matchExposedToolNames({
                exposedToolNames: claudeCodeToolNames,
                requestedToolNames: [webToolName],
            })
        ).toHaveLength(1);
    }
    for (const webAccess of [true, false]) {
        for (const name of resolveInactiveWebToolNames({
            exposedToolNames: claudeCodeToolNames,
            webAccess,
        })) {
            expect(claudeCodeToolNames).toContain(name);
        }
    }
});

test('case-insensitive matching stays unambiguous for every exposed tool name', () => {
    const seen = new Map<string, string>();
    for (const name of claudeCodeToolNames) {
        const previous = seen.get(name.toLowerCase());
        expect(previous).toBeUndefined();
        seen.set(name.toLowerCase(), name);
        expect(
            matchExposedToolNames({
                exposedToolNames: claudeCodeToolNames,
                requestedToolNames: [name.toUpperCase()],
            })
        ).toEqual([name]);
    }
});

test('drops requested names the runtime does not expose', () => {
    expect(
        matchExposedToolNames({
            exposedToolNames: ['read', 'WebFetch'],
            requestedToolNames: ['webFetch', 'browserOpen'],
        })
    ).toEqual(['WebFetch']);
});

test('gates builtin web tools only for the runtime that exposes them', () => {
    const harness = { builtinTools: { WebFetch: {}, read: {}, webSearch: {} } };
    expect(
        inactiveWebToolSettings(harness, { runtimeId: 'claude-code', webAccess: 'search' })
    ).toEqual({
        inactiveTools: ['WebFetch'],
    });
    expect(inactiveWebToolSettings(harness, { runtimeId: 'claude-code', webAccess: null })).toEqual(
        {
            inactiveTools: ['WebFetch', 'webSearch'],
        }
    );
    expect(inactiveWebToolSettings(harness, { runtimeId: 'codex', webAccess: null })).toEqual({});
});
