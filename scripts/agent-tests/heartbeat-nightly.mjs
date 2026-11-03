// The nightly-run heartbeat scenarios (specs/heartbeat.md#evals): the Agent's live
// session never saw the seeded exchange, so whatever the run produces comes from
// the digest and the run's own reading, not from in-session memory writes.
//
// Structure is gated here (turns settle, files survive, nothing is posted, the
// reminder exists and lands in the morning window). Wording quality is scored out
// of band by `heartbeat-grade.mjs` from the evidence file each run writes.

import {
    agentPosts,
    awaitDream,
    canaryRule,
    describeAgent,
    inMorningWindow,
    newPreferenceLines,
    readMemory,
    renderMemory,
    runReasoning,
    seedMessages,
    standingPreferenceLines,
    writeEvidence,
    writeMemory,
} from './heartbeat.mjs';

const seededRules = Object.freeze(['Keep replies short; lead with the answer.', canaryRule]);
const operatorZone = 'America/Chicago';

const correctionText = 'when you report numbers to me, lead with the total, then the breakdown.';

export async function runLearnsUnsavedCorrection(context) {
    const { agents, expect, kit, log } = context;
    const [worker] = agents;
    const setup = await seedNight(context, [
        { content: (h) => `@${h} what were last week's signups?`, minutesAgo: 300 },
        {
            authorAgent: true,
            content: () => '268 from referrals, 144 organic, so 412 total.',
            minutesAgo: 296,
        },
        { content: (h) => `@${h} ${correctionText}`, minutesAgo: 290 },
        { authorAgent: true, content: () => 'Got it.', minutesAgo: 289 },
    ]);

    log('starting the nightly heartbeat');
    const run = await kit.startHeartbeat(worker.id, 'nightly');
    const outcome = await collectNight(context, setup, run, 'heartbeat-learns-unsaved-correction');

    log('checking gates');
    expectSettled(expect, run);
    expect(outcome.after, 'Standing Preferences section survives').toBeTruthy();
    expect(outcome.after, 'unrelated seeded rule survives').toContain(canaryRule);
    expect(
        outcome.added.some((line) => /\btotals?\b/iu.test(line)),
        'a new Standing Preference captures leading with the total'
    ).toBe(true);
    expect(outcome.dream.summary, 'the dream summary').toBeTruthy();
    expect(outcome.dream.summary.toLowerCase(), 'the summary names the lesson').toContain('total');
    if (setup.operatorFirstName) {
        expect(
            outcome.dream.summary.toLowerCase().includes(setup.operatorFirstName.toLowerCase()),
            `the summary names ${setup.operatorFirstName}, who gave the lesson`
        ).toBe(true);
    }
    expectNoPosts(expect, outcome);
}

export async function runQuietDayControl(context) {
    const { agents, expect, kit, log } = context;
    const [worker] = agents;
    const setup = await seedNight(context, [
        { content: (h) => `@${h} where do the staging deploy logs live?`, minutesAgo: 240 },
        {
            authorAgent: true,
            content: () => 'In the CI job output, under the deploy step.',
            minutesAgo: 236,
        },
        { content: () => 'Perfect, thanks.', minutesAgo: 230 },
    ]);

    log('starting the nightly heartbeat');
    const run = await kit.startHeartbeat(worker.id, 'nightly');
    const outcome = await collectNight(context, setup, run, 'heartbeat-quiet-day-control');

    log('checking gates');
    expectSettled(expect, run);
    expect(outcome.after, 'Standing Preferences section survives').toBeTruthy();
    expect(outcome.after, 'unrelated seeded rule survives').toContain(canaryRule);
    expect(outcome.added, 'new Standing Preferences on a day with no corrections').toHaveLength(0);
    expectNoPosts(expect, outcome);
}

export async function runFollowsUpDroppedPromise(context) {
    const { agents, expect, kit, log } = context;
    const [worker] = agents;
    const previous = await kit.trpc('dev.setOperatorTimezone', {
        serverId: kit.serverId,
        timezone: operatorZone,
    });
    try {
        const setup = await seedNight(context, [
            {
                content: (h) => `@${h} can the Memphis warehouse still ship orders placed today?`,
                minutesAgo: 180,
            },
            {
                authorAgent: true,
                content: () => "I'll check the shipping cutoff and get back to you.",
                minutesAgo: 175,
            },
        ]);
        const [question, promise] = setup.seeded.messages;

        log('starting the nightly heartbeat');
        const run = await kit.startHeartbeat(worker.id, 'nightly');
        const outcome = await collectNight(
            context,
            setup,
            run,
            'heartbeat-follows-up-dropped-promise'
        );
        const reminders = (
            await kit.trpc('reminder.list', {
                agentId: worker.id,
                serverId: kit.serverId,
                status: 'scheduled',
            })
        ).filter((reminder) => reminder.ownerAgentId === worker.id);
        outcome.evidence.reminders = reminders;
        outcome.evidence.operatorTimezone = operatorZone;
        outcome.evidence.promiseMessageId = promise.id;
        await writeEvidence(outcome.evidence);

        log('checking gates');
        expectSettled(expect, run);
        expect(reminders, 'scheduled reminders owned by the Agent').toHaveLength(1);
        const [reminder] = reminders;
        expect(
            [promise.id, question.id].includes(reminder.anchorMessageId),
            'the reminder is anchored to the promise or the question it answers'
        ).toBe(true);
        expect(reminder.anchorChatId, 'the reminder anchor chat').toBe(setup.channel.id);
        expect(Date.parse(reminder.fireAt) > Date.now(), 'the reminder fires in the future').toBe(
            true
        );
        expect(
            inMorningWindow(reminder.fireAt, operatorZone),
            `the reminder fires 08:00-10:00 in ${operatorZone} (got ${reminder.fireAt})`
        ).toBe(true);
        expect(
            /\b(?:cutoff|ship(?:ping)?)\b/u.test(
                `${reminder.title} ${reminder.description ?? ''}`.toLowerCase()
            ),
            'the reminder names the shipping promise'
        ).toBe(true);
        expectNoPosts(expect, outcome);
    } finally {
        await kit
            .trpc('dev.setOperatorTimezone', {
                serverId: kit.serverId,
                timezone: previous.previous,
            })
            .catch(() => undefined);
    }
}

/** Writes the seeded memory, makes the channel, and seeds its exchange without waking the Agent. */
async function seedNight({ agents, kit, log }, script) {
    const [worker] = agents;
    log('seeding MEMORY.md and the exchange');
    const seededMemory = renderMemory({
        displayName: worker.displayName ?? worker.handle,
        rules: [...seededRules],
    });
    await writeMemory(kit, worker.id, seededMemory);
    const channel = await kit.createChannel({ agentIds: [worker.id] });
    const seeded = await seedMessages(
        kit,
        channel.id,
        script.map((entry) => ({
            ...(entry.authorAgent ? { authorAgentId: worker.id } : {}),
            content: entry.content(worker.handle),
            minutesAgo: entry.minutesAgo,
        }))
    );
    const operatorName = seeded.operator.displayName;
    return {
        channel,
        dmHead: await kit.readHead(worker.dmChatId),
        head: await kit.readHead(channel.id),
        operatorFirstName: operatorName ? operatorName.trim().split(/\s+/u)[0] : null,
        seeded,
        seededMemory,
    };
}

/** Reads everything the night left, writes the evidence file, and returns the facts the gates use. */
async function collectNight({ agents, kit }, setup, run, scenario) {
    const [worker] = agents;
    const dream = await awaitDream(kit, worker.id, run.triggeredAt);
    const after = await readMemory(kit, worker.id);
    const before = standingPreferenceLines(setup.seededMemory);
    const added = newPreferenceLines(before, standingPreferenceLines(after));
    const channelPosts = await agentPosts(kit, setup.channel.id, worker.id, setup.head);
    const dmPosts = await agentPosts(kit, worker.dmChatId, worker.id, setup.dmHead);
    const evidence = {
        agent: await describeAgent(kit, worker),
        dream: { followUps: dream.followUps, summary: dream.summary },
        heartbeatReasoning: await runReasoning(kit, worker.id, run),
        memory: { after, seeded: setup.seededMemory },
        operator: setup.seeded.operator,
        posts: { channel: channelPosts, dm: dmPosts },
        preferencesAdded: added,
        scenario,
        stamp: kit.stamp,
    };
    await writeEvidence(evidence);
    return { added, after, channelPosts, dmPosts, dream, evidence };
}

function expectSettled(expect, run) {
    expect(run.status, 'heartbeat turn status').toBe('completed');
    expect(run.failureKind ?? 'none', 'heartbeat turn failure kind').toBe('none');
}

function expectNoPosts(expect, outcome) {
    expect(outcome.channelPosts, 'Agent posts in the channel during the run').toHaveLength(0);
    expect(outcome.dmPosts, 'Agent posts in the Owner DM during the run').toHaveLength(0);
}
