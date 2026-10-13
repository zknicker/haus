import { expect, test } from 'bun:test';
import { tokenState } from './keychain.ts';

test('maps security exit codes to token states', () => {
    expect(tokenState(0)).toBe('present');
    expect(tokenState(44)).toBe('missing');
    // errSecInteractionNotAllowed (-25308) and errSecAuthFailed (-25293): a locked Keychain.
    expect(tokenState(36)).toBe('locked');
    expect(tokenState(51)).toBe('locked');
});
