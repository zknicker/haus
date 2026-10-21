import { expect, test } from 'bun:test';
import { getManualTopic, searchManualTopics } from './index.ts';
import { resolveManualTopic } from './search.ts';

test('secrets topic teaches haus-secrets without ever handling a value', () => {
    const body = getManualTopic('secrets')?.body;
    expect(body).toContain('`haus-secrets --list`');
    expect(body).toContain('`haus-secrets -- <command> [args...]`');
    expect(body).toContain('masking is a backstop, not permission');
    expect(body).toContain('Never ask anyone to paste a secret value in chat.');
    expect(body).toContain('ask the Server Owner to add it to the connected vault in 1Password');
    expect(body).toContain('ask the Server Owner to connect one from the desktop App');
});

test('an Agent looking for a key finds the secrets topic', () => {
    expect(resolveManualTopic('secret')?.id).toBe('secrets');
    for (const query of [
        'API key',
        'haus-secrets',
        'API key environment variable',
        'use a secret token',
        '1password vault',
        'credentials',
    ]) {
        expect(searchManualTopics(query, { limit: 5, scope: 'all' }).map(({ id }) => id)).toContain(
            'secrets'
        );
    }
});

test('the webhook recipe never treats the read-only vault as a place to install a secret', () => {
    const body = getManualTopic('recipes/technique/trigger-webhook')?.body;
    expect(body).toContain('is read-only, so it is never that destination');
});
