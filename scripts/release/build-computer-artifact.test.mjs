import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { isAcceptedComputerNotarization } from './build-computer-artifact.mjs';

test('signs the Bun executable with only its required memory entitlements', async () => {
    const entitlements = await readFile(
        new URL('./computer-entitlements.plist', import.meta.url),
        'utf8'
    );
    expect(entitlements).toContain('com.apple.security.cs.allow-jit');
    expect(entitlements).toContain('com.apple.security.cs.allow-unsigned-executable-memory');
    expect(entitlements).not.toContain('disable-library-validation');
    expect(entitlements).not.toContain('allow-dyld-environment-variables');
});

test('accepts only an explicit successful Computer notarization result', () => {
    expect(
        isAcceptedComputerNotarization({
            id: 'cab4599e-d673-45b9-95f5-5fe5597aa630',
            status: 'Accepted',
        })
    ).toBe(true);
    expect(
        isAcceptedComputerNotarization({
            id: 'cab4599e-d673-45b9-95f5-5fe5597aa630',
            status: 'Invalid',
        })
    ).toBe(false);
    expect(isAcceptedComputerNotarization({ status: 'Accepted' })).toBe(false);
});
