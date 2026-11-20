// Grader profiles as data, keyed by eval: per-scenario caps and checks the
// grader applies on top of each scenario's structural gates, plus the judge
// question for that eval. A scenario without a profile is graded on its runner
// verdict alone.

import { refersToKit } from '../agent-tests/placement-kit.mjs';

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
        result: (post) => refersToKit(post.content, { paths: ['pod-folder-system-starter-kit'] }),
        spec: 'S1',
    },
    'placement-quick-fact': {
        cap: 25,
        channel: [1, 1],
        noReactions: true,
        result: (post) => post.content.includes('43447'),
        spec: 'S2',
    },
    'placement-off-topic-quick-question': {
        cap: 25,
        channel: [1, 1],
        noReactions: true,
        result: (post) => post.content.includes('429'),
        spec: 'S7',
    },
    'ack-reaction-thanks': { channel: [0, 0], reaction: true, spec: 'S3' },
    'placement-recommendation': {
        cap: 80,
        channel: [1, 1],
        options: recommendationOptions,
        result: (post) => recommendationOptions.some((option) => option.test(post.content)),
        spec: 'S6',
    },
};

/**
 * Attention scenarios that capture routing evidence. Each grades every human
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
 * stops. Wrong: a Task for a fire the reply finishes, a second post, a recap of the payload,
 * or a tail offer.
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
 * "From now on" (ADR 0054 decision 10). Told "from now on, every Worker attaches
 * before/after screenshots", a good teammate adds one terse line to its
 * WORKER.md, leaves MEMORY.md alone, and confirms once inline, naming the file so
 * the human can open it. Told "from now on, keep replies under three
 * sentences", it does the same in its own AGENTS.md, and the confirmation obeys
 * the rule. Told a plain fact ("my timezone is Pacific"), it records the fact in
 * MEMORY.md and makes no rule file; a short reply or a reaction is enough. Wrong:
 * a rule in MEMORY.md, a rule in the wrong file, a second post, a question back,
 * or an offer to do more.
 */
export const ruleFileProfiles = {
    'rule-files-worker': { cap: 40, channel: [1, 1], maxQuestions: 0, spec: 'M7' },
    'rule-files-agent': { cap: 40, channel: [1, 1], maxQuestions: 0, spec: 'M8' },
};

/** Jev judge question for the placement eval; its yes-probability maps to 1-5 (pass bar 4). */
export const placementJudge = {
    no: 'The posts add anything beyond the answer, such as a recap, a plan, an offer, or extra questions, or they answer somewhere the human is not looking.',
    question:
        "Read the human's message and the agent's channel posts in order. Does this read like a focused coworker replying in Slack: answers what was asked, nothing extra, no recap, no offer?",
    yes: 'The posts answer exactly what was asked, where the human is looking, with nothing extra, no recap, and no offer.',
};
