import { describe, expect, test } from 'bun:test';
import {
    hasMaskedCredential,
    maskCredentialDisclosures,
    thoughtRedactionMarker,
} from './agent-thought-credentials.ts';
import { condenseThoughtLocally, thoughtReasoningExcerpt } from './agent-thought-phrase.ts';

const disclosure = 'The database password is hunter2 for staging access.';

describe('credential disclosures in thoughts', () => {
    test('masks the value of a disclosed password, secret, token, or key', () => {
        expect(maskCredentialDisclosures(disclosure)).toBe(
            `The database password is ${thoughtRedactionMarker} for staging access.`
        );
        for (const [text, secret] of [
            ['the API key: abc123xyz for billing', 'abc123xyz'],
            ['The token for staging was s3cr3t-value.', 's3cr3t-value'],
            ['secret = "opensesame"', 'opensesame'],
            ['the ssh key is AAAAB3Nza', 'AAAAB3Nza'],
            ['Passwords are hunter2 and hunter3', 'hunter2'],
            ['the key=k3y-material', 'k3y-material'],
            ['credentials set to admin:admin', 'admin:admin'],
        ] as const) {
            const masked = maskCredentialDisclosures(text);
            expect(masked).not.toContain(secret);
            expect(hasMaskedCredential(masked)).toBe(true);
        }
    });

    test('keeps prose that describes a credential without spelling it', () => {
        for (const text of [
            'The password is correct, so the login should work.',
            'The key is to compare this week against last week.',
            'The key question is whether the build is safe.',
            'Checking whether the token is expired before retrying.',
            'The monkey is asleep and the turkey is done.',
        ]) {
            expect(maskCredentialDisclosures(text)).toBe(text);
        }
    });

    test('the shared excerpt and fallback never carry the disclosed password', () => {
        const excerpt = thoughtReasoningExcerpt(maskCredentialDisclosures(disclosure));
        expect(excerpt).not.toContain('hunter2');
        expect(condenseThoughtLocally(maskCredentialDisclosures(disclosure))).not.toContain(
            'hunter2'
        );
    });
});
