import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient } from './haus-client.ts';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';
import { deviceToken } from './push-fake-sender.ts';

let fixture: NotificationFixture;

beforeAll(async () => {
    fixture = await startNotificationFixture();
});

afterAll(async () => {
    await fixture.close();
});

async function devices() {
    return (await fixture.harness.sql`
        select token, user_id, environment, bundle_id from push_devices order by token
    `) as Array<{ bundle_id: string; environment: string; token: string; user_id: string }>;
}

test('registering upserts by token and moves a token to the human registering it', async () => {
    const { owner, ownerUserId, peer, peerUserId } = fixture;
    const token = deviceToken('d4');

    expect(
        await owner.trpc.push.registerDevice.mutate({
            bundleId: 'chat.haus.ios',
            environment: 'sandbox',
            token: token.toUpperCase(),
        })
    ).toEqual({ ok: true });
    await owner.trpc.push.registerDevice.mutate({
        bundleId: 'chat.haus.ios',
        environment: 'production',
        token,
    });
    expect(await devices()).toEqual([
        { bundle_id: 'chat.haus.ios', environment: 'production', token, user_id: ownerUserId },
    ]);

    await peer.trpc.push.registerDevice.mutate({
        bundleId: 'chat.haus.ios',
        environment: 'sandbox',
        token,
    });
    expect(await devices()).toEqual([
        { bundle_id: 'chat.haus.ios', environment: 'sandbox', token, user_id: peerUserId },
    ]);

    // Ada no longer holds the token, so her sign-out cannot remove Bo's device.
    await owner.trpc.push.unregisterDevice.mutate({ token });
    expect(await devices()).toHaveLength(1);
    expect(await peer.trpc.push.unregisterDevice.mutate({ token })).toEqual({ ok: true });
    expect(await devices()).toEqual([]);
});

test('registration needs a signed-in human and a well-formed device', async () => {
    const anonymous = createHausClient(fixture.harness);
    try {
        await expect(
            anonymous.trpc.push.registerDevice.mutate({
                bundleId: 'chat.haus.ios',
                environment: 'sandbox',
                token: deviceToken('e5'),
            })
        ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
        await expect(
            anonymous.trpc.push.unregisterDevice.mutate({ token: deviceToken('e5') })
        ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
    } finally {
        anonymous.close();
    }

    const stranger = await fixture.signIn('user_push_stranger', ['stranger@haus.test']);
    try {
        await expect(
            stranger.trpc.push.registerDevice.mutate({
                bundleId: 'chat.haus.ios',
                environment: 'sandbox',
                token: deviceToken('f6'),
            })
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    } finally {
        stranger.close();
    }

    await expect(
        fixture.owner.trpc.push.registerDevice.mutate({
            bundleId: 'chat.haus.ios',
            environment: 'sandbox',
            token: 'not-a-token',
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    // The bundle id becomes the APNs topic, so only the Haus app's is accepted.
    await expect(
        fixture.owner.trpc.push.registerDevice.mutate({
            bundleId: 'com.example.other' as 'chat.haus.ios',
            environment: 'sandbox',
            token: deviceToken('a7'),
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    expect(await devices()).toEqual([]);
});
