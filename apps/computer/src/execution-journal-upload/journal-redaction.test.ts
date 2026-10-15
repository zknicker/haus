import { expect, test } from 'bun:test';
import { computerKnownSecrets, createJournalRedactor, isSecretKey } from './journal-redaction.ts';

const redact = createJournalRedactor(['exact-known-value-1234', 'short']);

test('masks exact known values, longest first, but never short ones', () => {
    expect(redact('a exact-known-value-1234 b')).toBe('a [redacted] b');
    expect(redact('a short b')).toBe('a short b');
});

test('masks credential shapes wherever they appear', () => {
    const cases: [string, string][] = [
        ['Authorization: Bearer abcdefghijklmnop', 'Authorization: Bearer [redacted]'],
        ['key sk-proj-abcdefghijklmnopqrstuvwx used', 'key [redacted] used'],
        ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', '[redacted]'],
        ['xoxb-1234567890-abcdefghij', '[redacted]'],
        ['AKIAABCDEFGHIJKLMNOP', '[redacted]'],
        ['eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeK', '[redacted]'],
        [`grta_${'x'.repeat(43)}`, '[redacted]'],
        [
            '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----',
            '[redacted]',
        ],
    ];
    for (const [input, expected] of cases) {
        expect(redact(input)).toBe(expected);
    }
});

test('masks secret-named assignments, flags, headers, JSON keys, URL userinfo, and query params', () => {
    expect(redact('GITHUB_TOKEN=abc123 npm publish')).toBe('GITHUB_TOKEN=[redacted] npm publish');
    expect(redact('password = "hunter2"')).toBe('password = "[redacted]"');
    expect(redact('tool --api-key abc123 --name x')).toBe('tool --api-key [redacted] --name x');
    expect(redact('curl -u alice:wonderland https://x')).toBe('curl -u [redacted] https://x');
    expect(redact('git push -u origin main')).toBe('git push -u origin main');
    expect(redact('X-Api-Key: 0123456789abcdef')).toBe('X-Api-Key: [redacted]');
    expect(redact('{"client_secret": "s3cr3t", "name": "ok"}')).toBe(
        '{"client_secret": "[redacted]", "name": "ok"}'
    );
    expect(redact('postgres://haus:pw@db.local:5432/haus')).toBe(
        'postgres://[redacted]@db.local:5432/haus'
    );
    expect(redact('https://api.x/v1?access_token=abc&page=2&sig=zz')).toBe(
        'https://api.x/v1?access_token=[redacted]&page=2&sig=[redacted]'
    );
});

test('keeps ordinary evidence intact', () => {
    const plain = 'ls -la src && grep -n "sessionId" author.ts # max_tokens=100';
    expect(redact(plain)).toBe(plain);
    expect(redact('https://github.com/acme/repo/pull/12')).toBe(
        'https://github.com/acme/repo/pull/12'
    );
});

test('names secret keys by their last word, not any substring', () => {
    for (const name of ['apiKey', 'OPENAI_API_KEY', 'refresh_token', 'Authorization', 'auth']) {
        expect(isSecretKey(name)).toBe(true);
    }
    for (const name of ['sessionId', 'author', 'max_tokens', 'cache_key', 'tokens', 'keyboard']) {
        expect(isSecretKey(name)).toBe(false);
    }
});

test('the Computer knows its credential and its secret-named environment values', () => {
    expect(
        computerKnownSecrets('cred-value', {
            HOME: '/Users/haus',
            OPENAI_API_KEY: 'sk-live',
            STRIPE_TOKEN: '',
        })
    ).toEqual(['cred-value', 'sk-live']);
});
