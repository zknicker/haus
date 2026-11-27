import { expect, test } from 'bun:test';
import { gradeBuild, isInfraFailure } from './grade.mjs';
import { crewProfiles, githubTriggerProfiles, placementProfiles, probeStart } from './profiles.mjs';
import { summarizeEval } from './summary.mjs';
import { quickFactEvidence, temporaryRoot, writeRun } from './test-fixtures.mjs';

const names = ['placement-quick-fact', 'ack-reaction-thanks', 'mention-wakes-only-addressed'];

async function gradeFixture(scenarios, stamp = '20261015T100000') {
    const root = await temporaryRoot();
    await writeRun(root, stamp, scenarios);
    return await gradeBuild({
        names,
        profiles: placementProfiles,
        root,
        runs: [{ pass: 1, stamp }],
    });
}

test('a focused inline --done reply passes every grader check and carries both flags', async () => {
    const [grade] = await gradeFixture([
        { evidence: quickFactEvidence(), name: 'placement-quick-fact', ok: true },
    ]);
    expect(grade.checks.filter((check) => !check.ok)).toEqual([]);
    expect(grade.result).toMatchObject({ label: 'inline-reply', words: 1 });
    expect(grade.finished).toBe(true);
    expect(grade.repliesToRequest).toBe(true);
    expect(grade.pass).toBe(1);
    expect(grade.timeline.map((entry) => entry.who)).toEqual(['human', 'human', 'agent']);
    expect(grade.timeline.at(-1)).toMatchObject({ finished: true, label: 'inline-reply' });
});

test('a top-level, over-cap answer with a tail fails the matching checks', async () => {
    const reply = `The dev server is on 43447 this week. ${'More detail. '.repeat(10)}Want me to restart it?`;
    const [grade] = await gradeFixture([
        {
            evidence: quickFactEvidence({ inline: false, reply }),
            name: 'placement-quick-fact',
            ok: false,
            error: 'AssertionError: result post placement: expected "inline-reply", got "top-level"',
        },
    ]);
    const failed = grade.checks.filter((check) => !check.ok).map((check) => check.name);
    expect(failed).toEqual(['no tail phrase', 'result is an inline reply', 'result <= 25 words']);
    expect(grade.tails).toEqual(['want me to']);
    expect(grade.infra).toBe(false);
});

test('a post in a Task started from the channel is a Task post; any other chat fails', async () => {
    const evidence = quickFactEvidence();
    const note = (id, chatId) => ({
        ...evidence.chats[0].messages.at(-1),
        chatId,
        content: 'Notes on the port.',
        createdAt: '2026-10-15T10:00:06.000Z',
        id,
        reply: null,
    });
    evidence.chats[0].tasks = [
        { chatId: 'cht_task', originMessageId: 'msg_ans33333', taskId: 'tsk_1' },
    ];
    evidence.chats.push(
        { chatId: 'cht_task', messages: [note('msg_task4444', 'cht_task')], tasks: [] },
        { chatId: 'cht_other', messages: [note('msg_else5555', 'cht_other')], tasks: [] }
    );
    const [grade] = await gradeFixture([{ evidence, name: 'placement-quick-fact', ok: true }]);
    const labels = Object.fromEntries(grade.posts.map((post) => [post.id, post.label]));
    expect(labels).toMatchObject({ msg_else5555: 'elsewhere', msg_task4444: 'task' });
    const failed = grade.checks.filter((check) => !check.ok).map((check) => check.name);
    expect(failed).toEqual(['no post in another chat']);
});

test('a scenario can name the chat its request lands in and Task chats it opened', async () => {
    const evidence = quickFactEvidence();
    const own = (message) => ({ ...message, chatId: 'cht_own' });
    const [, ask, answer] = evidence.chats[0].messages;
    evidence.chats[0].messages = [evidence.chats[0].messages[0]];
    evidence.chats.push(
        { chatId: 'cht_own', messages: [own(ask), own({ ...answer, reply: null })], tasks: [] },
        {
            chatId: 'cht_crew',
            messages: [{ ...answer, chatId: 'cht_crew', id: 'msg_brief666', reply: null }],
            tasks: [],
        }
    );
    evidence.rootChatId = 'cht_own';
    evidence.taskChatIds = ['cht_crew'];
    const root = await temporaryRoot();
    await writeRun(root, '20261015T100000', [
        { evidence, name: 'captain-chat-quick-answer', ok: true },
    ]);
    const [grade] = await gradeBuild({
        names: ['captain-chat-quick-answer'],
        profiles: {
            'captain-chat-quick-answer': {
                ...placementProfiles['placement-quick-fact'],
                inChat: true,
            },
        },
        root,
        runs: [{ pass: 1, stamp: '20261015T100000' }],
    });
    const labels = Object.fromEntries(grade.posts.map((post) => [post.id, post.label]));
    expect(labels).toEqual({ msg_ans33333: 'top-level', msg_brief666: 'task' });
    expect(grade.request.chatId).toBe('cht_own');
    expect(grade.checks.filter((check) => !check.ok)).toEqual([]);
});

test('crew work passes on an acknowledgement and one completion, and fails on narration or silence', async () => {
    const graded = async (replies) => {
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
        await writeRun(root, '20261015T100000', [
            { evidence, name: 'crew-finish-reaches-person', ok: true },
        ]);
        const [grade] = await gradeBuild({
            names: ['crew-finish-reaches-person'],
            profiles: crewProfiles,
            root,
            runs: [{ pass: 1, stamp: '20261015T100000' }],
        });
        return grade.checks.filter((check) => !check.ok).map((check) => check.name);
    };
    const ack = 'A crew Task is on it; I will send you the hash when it is done.';
    const done = 'Done: the first 12 hex characters are `146d084de157`.';
    expect(await graded([ack, done])).toEqual([]);
    expect(await graded([done])).toEqual([]);
    expect(await graded([ack, 'The [hash task](task://g6rywqc4) is running.', done])).toEqual([
        'channel posts 1-2',
    ]);
    expect(await graded([ack])).toEqual(['result post found']);
});

test('a probe-ending profile grades up to the scenario probe and still catches earlier strays', async () => {
    const answer = quickFactEvidence().chats[0].messages.at(-1);
    const post = (chatId, id, second, content, kind = 'agent') => ({
        ...answer,
        ...(kind === 'human' ? { author: { kind: 'human' } } : {}),
        chatId,
        content,
        createdAt: `2026-10-15T10:00:${second}.000Z`,
        id,
        reply: null,
    });
    const graded = async (chats) => {
        const evidence = quickFactEvidence();
        evidence.chats.push(...chats);
        const root = await temporaryRoot();
        await writeRun(root, '20261015T100000', [
            { evidence, name: 'placement-quick-fact', ok: true },
        ]);
        const [grade] = await gradeBuild({
            names,
            profiles: {
                'placement-quick-fact': {
                    ...placementProfiles['placement-quick-fact'],
                    until: probeStart,
                },
            },
            root,
            runs: [{ pass: 1, stamp: '20261015T100000' }],
        });
        return grade.checks.filter((check) => !check.ok).map((check) => check.name);
    };
    const probe = {
        chatId: 'cht_probe',
        messages: [
            post('cht_probe', 'msg_probeask', '07', 'how does DNS work?', 'human'),
            post(
                'cht_probe',
                'msg_probeans',
                '08',
                'Resolvers walk the tree. Want me to go deeper?'
            ),
        ],
        tasks: [],
    };
    expect(await graded([probe])).toEqual([]);
    const stray = {
        chatId: 'cht_other',
        messages: [post('cht_other', 'msg_stray666', '06', 'Notes on the port.')],
        tasks: [],
    };
    expect(await graded([stray, probe])).toEqual(['no post in another chat']);
});

test('infra failures are flagged, and unprofiled scenarios grade on the runner verdict', async () => {
    const grades = await gradeFixture([
        {
            error: 'Error: Agent @eval-worker1 never became ready within 300s (status=pending)',
            name: 'ack-reaction-thanks',
            ok: false,
        },
        { name: 'mention-wakes-only-addressed', ok: true },
        { name: 'not-in-this-eval', ok: true },
    ]);
    expect(grades.map((grade) => grade.scenario)).toEqual([
        'ack-reaction-thanks',
        'mention-wakes-only-addressed',
    ]);
    expect(grades[0].infra).toBe(true);
    expect(grades[1]).toMatchObject({ checks: [], infra: false, ok: true, spec: null });

    const summary = summarizeEval({ grades: { change: grades }, scenarios: names });
    expect(summary.totals.change).toEqual({ graded: 1, infra: 1, passed: 1, runs: 2 });
    expect(summary.verdict.delta).toBeNull();
});

test('a GitHub fire answer grades from the first caused post and only has to land in the anchor chat', async () => {
    const evidence = quickFactEvidence();
    const [chat] = evidence.chats;
    chat.messages = [
        chat.messages[0],
        { ...chat.messages[2], content: 'Noted, thanks.', id: 'msg_ack44444', reply: undefined },
        {
            ...chat.messages[2],
            cause: { fireId: 'tfi_one', kind: 'trigger' },
            content: 'Release Gate failed on main in acme/api.',
            createdAt: '2026-10-15T10:00:30.000Z',
            id: 'msg_fire5555',
            reply: undefined,
        },
    ];
    const root = await temporaryRoot();
    await writeRun(root, '20261015T120000', [
        { evidence, name: 'github-trigger-fire-reply', ok: true },
    ]);
    const [grade] = await gradeBuild({
        names: ['github-trigger-fire-reply'],
        profiles: githubTriggerProfiles,
        root,
        runs: [{ pass: 1, stamp: '20261015T120000' }],
    });
    expect(grade.checks.filter((check) => !check.ok)).toEqual([]);
    expect(grade.posts.map((post) => post.id)).toEqual(['msg_fire5555']);
    expect(grade.result).toMatchObject({ label: 'top-level' });
});

test('a run missing its summary is skipped rather than invented', async () => {
    const root = await temporaryRoot();
    const grades = await gradeBuild({
        names,
        profiles: placementProfiles,
        root,
        runs: [{ pass: 1, stamp: '20261015T110000' }],
    });
    expect(grades).toEqual([]);
});

test('infra classification keeps behavioral assertion failures out', () => {
    expect(isInfraFailure('Error: fetch failed')).toBe(true);
    expect(
        isInfraFailure('Error: Execution journal for run run_1 stayed missing after 10 tries')
    ).toBe(true);
    expect(isInfraFailure('AssertionError: posts in the request thread: expected 0, got 1')).toBe(
        false
    );
    expect(isInfraFailure(null)).toBe(false);
});
