import { describe, expect, test } from 'bun:test';
import { parseLinearIssueUrl } from './linear-issues.ts';

describe('parseLinearIssueUrl', () => {
    test('reduces an issue link to its workspace, key, and normalized URL', () => {
        expect(
            parseLinearIssueUrl('https://linear.app/Haus-Chat/issue/des-142/fix-the-mockup?x=1#c')
        ).toEqual({
            identifier: 'DES-142',
            url: 'https://linear.app/haus-chat/issue/DES-142',
            urlKey: 'haus-chat',
        });
        expect(parseLinearIssueUrl('https://linear.app/haus/issue/HTST-7')?.identifier).toBe(
            'HTST-7'
        );
    });

    test('refuses anything that is not exactly an issue link', () => {
        for (const href of [
            'http://linear.app/haus/issue/DES-1',
            'https://www.linear.app/haus/issue/DES-1',
            'https://linear.app.evil.com/haus/issue/DES-1',
            'https://user@linear.app/haus/issue/DES-1',
            'https://linear.app:8443/haus/issue/DES-1',
            'https://linear.app/haus/project/DES-1',
            'https://linear.app/haus/issue/DES-0',
            'https://linear.app/haus/issue/DES',
            'https://linear.app/haus/issue/DES-1/slug/extra',
            'https://linear.app/haus',
            'not a url',
        ]) {
            expect(parseLinearIssueUrl(href)).toBeNull();
        }
    });
});
