import { expect, test } from 'bun:test';
import { exportPKCS8, generateKeyPair } from 'jose';
import { createPushSender } from './push-configuration.ts';

test('a malformed APPLE_TEAM_ID disables push with a reason instead of failing boot', async () => {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    const key = { keyId: 'KEY1234567', privateKey: await exportPKCS8(privateKey) };

    expect(await createPushSender({ ...key, teamId: 'not-a-team' })).toEqual({
        sender: null,
        status: 'iPhone push disabled: APPLE_TEAM_ID is not a 10-character Apple team id',
    });
    const enabled = await createPushSender({ ...key, teamId: 'XJ8RZZT99R' });
    expect(enabled.sender).not.toBeNull();
    await enabled.sender?.close();
});
