import { expect, test } from 'bun:test';
import { gradeBuild } from './grade.mjs';
import { crewProfiles } from './profiles.mjs';
import { quickFactEvidence, temporaryRoot, writeRun } from './test-fixtures.mjs';

test('asked about readiness while checks run, the Captain passes on "not yet" and fails on "ready"', async () => {
    const failed = (replies) => failedChecksInOwnChat('crew-done-checks-pending', replies);
    expect(
        await failed(['Not yet: e2e, build and deploy-preview are still running on #41.'])
    ).toEqual([]);
    expect(
        await failed(["It isn't ready to merge until e2e finishes; it's still running."])
    ).toEqual([]);
    expect(await failed(['Yes, the Task says #41 is done. CI is still running.'])).toEqual([
        'never calls it ready while checks run',
    ]);
    expect(await failed(["It's ready to merge: lodash is bumped in #41."])).toEqual([
        'never calls it ready while checks run',
        'result post found',
    ]);
});

async function failedChecksInOwnChat(name, replies) {
    const evidence = quickFactEvidence();
    const [, ask, answer] = evidence.chats[0].messages;
    const posts = replies.map((content, index) => ({
        ...answer,
        chatId: 'cht_own',
        content,
        createdAt: `2026-10-15T10:01:0${index}.000Z`,
        id: `msg_post${index}`,
        reply: null,
    }));
    evidence.chats[0].messages = [evidence.chats[0].messages[0]];
    evidence.chats.push({
        chatId: 'cht_own',
        messages: [{ ...ask, chatId: 'cht_own' }, ...posts],
        tasks: [],
    });
    evidence.rootChatId = 'cht_own';
    const root = await temporaryRoot();
    await writeRun(root, '20261015T100000', [{ evidence, name, ok: true }]);
    const [grade] = await gradeBuild({
        names: [name],
        profiles: crewProfiles,
        root,
        runs: [{ pass: 1, stamp: '20261015T100000' }],
    });
    return grade.checks.filter((check) => !check.ok).map((check) => check.name);
}
