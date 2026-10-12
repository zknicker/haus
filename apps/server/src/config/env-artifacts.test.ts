import { expect, test } from 'bun:test';
import { parseEnvironment } from './env.ts';

test('shared artifacts may be unavailable but enabled or partial R2 configuration fails closed', () => {
    expect(parseEnvironment({}).HAUS_ENABLE_ARTIFACT_STORAGE).toBe(false);
    expect(() => parseEnvironment({ HAUS_ENABLE_ARTIFACT_STORAGE: 'true' })).toThrow('all four');
    expect(() => parseEnvironment({ HAUS_ARTIFACT_R2_BUCKET: 'private-files' })).toThrow(
        'all four'
    );
    const configured = parseEnvironment({
        HAUS_ENABLE_ARTIFACT_STORAGE: 'true',
        HAUS_ARTIFACT_R2_BUCKET: 'private-files',
        HAUS_ARTIFACT_R2_ENDPOINT: 'https://r2.invalid',
        HAUS_ARTIFACT_R2_ACCESS_KEY_ID: 'test-key',
        HAUS_ARTIFACT_R2_SECRET_ACCESS_KEY: 'test-secret',
    });
    expect(configured.HAUS_ENABLE_ARTIFACT_STORAGE).toBe(true);
});
