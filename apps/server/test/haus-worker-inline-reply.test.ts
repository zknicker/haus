import { expect, test } from 'bun:test';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test('an invalid inline parent rejects cloud work before writes', async () => {
    const runner = await fixture.mintRunner('run_cloud_invalid_reply');
    const before = await fixture.countWork();
    const response = await fixture.postStart(
        runner,
        fixture.startBody({
            nonce: 'invalid-inline-cloud',
            replyToMessageId: 'msg_missing',
        })
    );
    expect(response.status).toBe(400);
    expect(await fixture.countWork()).toBe(before);
});
