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

const foundTheKit = {
    cap: 180,
    channel: [1, 2],
    maxQuestions: 1,
    requests: 'channel-humans',
    result: (post) => namesKitRules(post.content),
};

/**
 * Placement spec: answer where the asker looks, only what was asked, stop.
 * `channel` bounds channel posts as [min, max]; `cap` bounds the result post's words.
 */
export const placementProfiles = {
    'placement-found-the-kit-files': { ...foundTheKit, spec: 'S1' },
    'placement-found-the-kit-local': { ...foundTheKit, spec: 'S1-local' },
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

/** Jev judge question for the placement eval; its yes-probability maps to 1-5 (pass bar 4). */
export const placementJudge = {
    no: 'The posts add anything beyond the answer, such as a recap, a plan, an offer, or extra questions, or they answer somewhere the human is not looking.',
    question:
        "Read the human's message and the agent's channel posts in order. Does this read like a focused coworker replying in Slack: answers what was asked, nothing extra, no recap, no offer?",
    yes: 'The posts answer exactly what was asked, where the human is looking, with nothing extra, no recap, and no offer.',
};
