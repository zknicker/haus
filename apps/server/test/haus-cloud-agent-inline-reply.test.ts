import { expect, test } from 'bun:test';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();
// ADR 0052: a launch posts in its Task, so the inline Channel card is gone; an
// inline parent must still be valid in the Task.

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
