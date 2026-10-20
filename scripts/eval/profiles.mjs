// Grader profiles as data, keyed by eval: per-scenario caps and checks the
// grader applies on top of each scenario's structural gates, plus the judge
// question for that eval. A scenario without a profile is graded on its runner
// verdict alone.

import { namesKitRules } from '../agent-tests/placement-kit.mjs';

export const tailPhrases = [
    'want me to',
    'would you like me to',
    'shall i',
    'let me know if',
    'happy to',
    'just say the word',
    "if you'd like",
    'feel free to',
];

export const recommendationOptions = [/\bdog[\s-]?moms?\b/iu, /\bteachers?\b/iu];

/**
 * Placement spec: answer where the asker looks, only what was asked, stop.
 * `channel` bounds channel posts as [min, max]; `cap` bounds the result post's words.
 */
export const placementProfiles = {
    'placement-found-the-kit-files': {
        cap: 180,
        channel: [1, 2],
        maxQuestions: 1,
        requests: 'channel-humans',
        result: (post) => namesKitRules(post.content),
        spec: 'S1',
    },
    'placement-quick-fact': {
        cap: 25,
        channel: [1, 1],
        noReactions: true,
        result: (post) => post.content.includes('43447'),
        spec: 'S2',
    },
    'ack-reaction-thanks': { channel: [0, 0], reaction: true, spec: 'S3' },
    'thread-reply-stays-in-thread': { cap: 40, channel: [0, 0], inThread: true, spec: 'S4' },
    'solo-progress-threads-on-ack': {
        cap: 60,
        channel: [1, 2],
        result: (post) => /\b44\b/u.test(post.content),
        spec: 'S5',
    },
    'placement-recommendation': {
        cap: 80,
        channel: [1, 1],
        options: recommendationOptions,
        result: (post) => recommendationOptions.some((option) => option.test(post.content)),
        spec: 'S6',
    },
};

/**
 * Attention scenarios that capture routing evidence. Both grade every human
 * message in the channel as a request, so an answer inline anywhere in the
 * exchange counts as an inline reply.
 */
export const attentionProfiles = {
    'mention-wakes-only-addressed': {
        cap: 30,
        channel: [1, 1],
        requests: 'channel-humans',
        result: (post) => post.content.includes('323'),
        spec: 'A1',
    },
    'task-thread-routing': {
        cap: 70,
        channel: [1, 2],
        requests: 'channel-humans',
        spec: 'A4',
    },
};

/**
 * GitHub Trigger setup and fire answers (specs/agent-e2e/README.md R8, R9).
 *
 * Setup (R8): asked "wake me when CI fails on main in acme", a good teammate
 * sets it up and says so once, as an inline reply in the channel: one short
 * confirmation of what will wake it (a failed CI run on main in acme) and where
 * it will post. No Trigger secret, no URL, no setup narration, and no question
 * when the ask is already clear. Wrong: a webhook, a question back, a recap of
 * flags, or an offer to do more.
 *
 * Fire (R9): when CI fails, the teammate posts one short top-level message in
 * the channel it was asked in, naming the failing workflow and the branch, and
 * stops. Wrong: a Thread, a second post, a recap of the payload, or a tail offer.
 */
export const githubTriggerProfiles = {
    'github-trigger-ci-setup': {
        cap: 45,
        // Setup is multi-step work: a pickup note plus the result is the placement rule.
        channel: [1, 2],
        maxQuestions: 0,
        noUrl: true,
        spec: 'R8',
    },
    'github-trigger-fire-reply': {
        cap: 50,
        channel: [1, 1],
        inChat: true,
        result: (post) => /release gate/iu.test(post.content) && /\bmain\b/u.test(post.content),
        since: (authored) =>
            authored.find((message) => message.cause?.kind === 'trigger')?.createdAt,
        spec: 'R9',
    },
};

/**
 * Linear Trigger setup and fire answers (specs/linear-triggers.md).
 *
 * Setup (L1): asked "ping me when a Design issue goes from Design Review to
 * Changes Requested", a good teammate sets it up and says so once, as an inline
 * reply in the channel: one short confirmation of what will wake it and where
 * it will post. No token or secret, no URL, no flag recap, and no question
 * when the ask is already clear. Wrong: a webhook, a question back, a recap of
 * the match group, or an offer to do more.
 *
 * Fire (L2): when an issue moves, the teammate posts one short top-level
 * message in the channel it was asked in, naming the issue by identifier, and
 * stops. Wrong: a Thread, a second post, a dump of the payload, or a tail offer.
 */
export const linearTriggerProfiles = {
    'linear-trigger-setup': {
        cap: 45,
        // Setup is multi-step work: a pickup note plus the result is the placement rule.
        channel: [1, 2],
        maxQuestions: 0,
        noUrl: true,
        spec: 'L1',
    },
    'linear-trigger-fire-reply': {
        cap: 50,
        channel: [1, 1],
        inChat: true,
        result: (post) => /\bDES-\d+\b/u.test(post.content),
        since: (authored) =>
            authored.find((message) => message.cause?.kind === 'trigger')?.createdAt,
        spec: 'L2',
    },
};

/**
 * Heartbeat quality (specs/heartbeat.md#evals), scored out of band by
 * `scripts/agent-tests/heartbeat-grade.mjs` from each run's evidence file. The
 * scenarios gate structure (files, reports, posts, reminders); a profile adds what
 * the spec says about the words.
 *
 * Summary (HB1, HB2): a few lines in the Agent's voice naming the lesson, who
 * taught it, and any correction it had acknowledged but never saved. A quiet day
 * invents no lesson. Report (HB4): findings first, short, with why it matters, how
 * sure, and a next step. Quiet-run awareness (HB6): asked what it has been up to,
 * the Agent says honestly that it checked in.
 */
export const heartbeatProfiles = {
    'heartbeat-learns-unsaved-correction': {
        rule: { maxWords: 20 },
        spec: 'HB1',
        summary: {
            acknowledgedNotSaved:
                /\b(acknowledg\w*|agreed|said (?:it|i|got it)|but (?:never|didn'?t|did not|hadn'?t|had not)|never (?:saved|wrote|recorded|noted)|not (?:saved|written|recorded|noted)|unsaved)\b/iu,
            maxWords: 90,
            requires: [/\btotal\b/iu],
        },
    },
    'heartbeat-quiet-day-control': { spec: 'HB2', summary: { maxWords: 60, noLesson: true } },
    'heartbeat-follows-up-dropped-promise': {
        followUp: { mentions: /cutoff/iu },
        spec: 'HB3',
    },
    'heartbeat-surfaces-new-signal': {
        report: {
            confidence:
                /\b(confident|sure|likely|unclear|unverified|confirmed|certain|probably|appears?|based on|from the ledger)\b/iu,
            findingFirst: /ORD-9001|chargeback/iu,
            maxWords: 90,
            nextStep:
                /\b(suggest|recommend|next|should|propose|check|confirm|escalate|follow up)\b/iu,
            requires: [/ORD-9001|chargeback/iu, /48,?200|frozen|Friday/iu],
        },
        spec: 'HB4',
    },
    'heartbeat-nothing-new-control': { spec: 'HB5' },
    'heartbeat-quiet-run-awareness': {
        reply: {
            forbids: [
                /\b(?:nothing|haven'?t|have not)\b[^.]{0,30}\b(?:done|run|checked|looked)\b/iu,
            ],
            requires: [/\bheartbeat\b|\bcheck(?:ed|ing)?\s+(?:in|on)\b|\bchecked\b/iu],
        },
        spec: 'HB6',
    },
    'heartbeat-lead-dedupe': { spec: 'HB7' },
};

/** Jev judge question for the placement eval; its yes-probability maps to 1-5 (pass bar 4). */
export const placementJudge = {
    no: 'The posts add anything beyond the answer, such as a recap, a plan, an offer, or extra questions, or they answer somewhere the human is not looking.',
    question:
        "Read the human's message and the agent's channel posts in order. Does this read like a focused coworker replying in Slack: answers what was asked, nothing extra, no recap, no offer?",
    yes: 'The posts answer exactly what was asked, where the human is looking, with nothing extra, no recap, and no offer.',
};
