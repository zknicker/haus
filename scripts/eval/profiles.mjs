// Grader profiles as data, keyed by eval: per-scenario caps and checks the
// grader applies on top of each scenario's structural gates, plus the judge
// question for that eval. A scenario without a profile is graded on its runner
// verdict alone.

import { refersToKit } from '../agent-tests/placement-kit.mjs';

/** A post that says some checks have not finished. */
export const pendingChecksPattern =
    /\b(?:running|pending|queued|in progress|not (?:yet )?(?:done|finished|green|ready))\b/iu;

/** A post that calls the pull request ready now: "yes …", "it's ready to merge", "looks good to go". */
export const readyClaimPattern =
    /^\W*(?:yes|yep|yeah)\b|\b(?:it'?s|is|looks)\s+(?:ready|good|safe)\s+to\s+(?:merge|ship|go)\b/iu;

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
    // S8: a quick question in the Agent's own chat (the Captain chat, or the Owner DM before
    // ADR 0062) gets one short answer there and nothing anywhere else. A top-level reply in a
    // one-to-one chat is where the asker looks.
    'captain-chat-quick-answer': {
        cap: 30,
        channel: [1, 1],
        inChat: true,
        maxQuestions: 0,
        result: (post) => /\b24\b/u.test(post.content),
        spec: 'S8',
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
 * Crew (ADR 0062).
 *
 * Issue (C1, runner verdict only): handed an Issue that is real work, a good Captain picks it up
 * without being asked in chat, starts one crew Task linked to it with a brief naming the Issue,
 * and leaves the Issue's state alone except for moving it to in progress. Wrong: doing the work
 * in its own turn, a channel post, or closing the Issue.
 *
 * Finish (C2): asked in its Captain chat for crew work, a good Captain behaves as Capy's does. It
 * may say once, right away, that crew is on it. When it hears its crew finished, it reads the
 * Task's chat and tells the person in one message in the Captain chat, with the result. A
 * decision or blocker that is theirs reaches them too. Wrong: a pickup note and a separate start
 * note, a post per Task or per turn, silence after the work is done, or an offer.
 *
 * Home Task (C4): a Task a person started answers in its own chat, briefly, with nothing extra,
 * and posts nowhere else. Both graded profiles read the last post carrying the result.
 *
 * Build question (C5, runner verdict only): "could we get a script that…?" is a request to
 * build. A good Captain starts one crew Task in that turn with a brief that carries the ask, says
 * so at most once, and puts any question beside the moving work. Wrong: answering "sure, want me
 * to?", doing the work itself, or a plan with no Task.
 *
 * Routine wake (C6, runner verdict only): a crew Task ends a turn with its change pushed and
 * checks still running. Nobody asked the Captain anything and nothing needs a person yet, so a
 * good Captain reads the Task and posts nothing. Wrong: a status post in the Captain chat or a
 * channel.
 *
 * Checks pending (C7): asked whether that work is ready to merge, a good Captain looks at what
 * the Task reported and answers in one short message that it is not ready yet because checks are
 * still running, naming them. Wrong: "yes", calling it ready on the Task's word, or an offer.
 */
export const crewProfiles = {
    'crew-done-checks-pending': {
        cap: 60,
        channel: [1, 2],
        forbid: { label: 'never calls it ready while checks run', pattern: readyClaimPattern },
        inChat: true,
        result: (post) => pendingChecksPattern.test(post.content),
        spec: 'C7',
    },
    // At most an acknowledgement and the completion; the completion carries the 12-hex digest.
    'crew-finish-reaches-person': {
        cap: 30,
        channel: [1, 2],
        inChat: true,
        result: (post) => /\b[0-9a-f]{12}\b/u.test(post.content),
        spec: 'C2',
    },
    'home-task-works-with-person': {
        cap: 30,
        channel: [1, 2],
        inChat: true,
        result: (post) => /\b782\b/u.test(post.content),
        spec: 'C4',
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
 * "From now on" (ADR 0054 decision 10). Told "from now on, every crew Task you
 * start attaches before/after screenshots", a good teammate adds one terse line to its
 * WORKER.md, leaves MEMORY.md alone, and confirms once inline, naming the file so
 * the human can open it. Told "from now on, keep replies under three
 * sentences", it does the same in its own AGENTS.md, and the confirmation obeys
 * the rule. Told a plain fact ("my timezone is Pacific"), it records the fact in
 * MEMORY.md and makes no rule file; a short reply or a reaction is enough. Wrong:
 * a rule in MEMORY.md, a rule in the wrong file, a second post, a question back,
 * or an offer to do more.
 */
/** When the human first speaks outside the root chat: a scenario's own probe, which it judges. */
export function probeStart(messages, rootChatId) {
    return (
        messages
            .filter((message) => message.author.kind === 'human' && message.chatId !== rootChatId)
            .map((message) => message.createdAt)
            .sort()[0] ?? null
    );
}

export const ruleFileProfiles = {
    'rule-files-worker': { cap: 40, channel: [1, 1], maxQuestions: 0, spec: 'M7' },
    'rule-files-agent': {
        cap: 40,
        channel: [1, 1],
        maxQuestions: 0,
        spec: 'M8',
        until: probeStart,
    },
};

/**
 * Computer targets (ADR 0057 decision 4). Asked "can you grab a screenshot of my
 * MacBook?" while the MacBook allows the Agent but is offline, a good teammate
 * tries the MacBook, then tells the human once, inline, that the MacBook is
 * offline so there is no screenshot yet, and stops. Wrong: a screenshot of its
 * own machine passed off as the MacBook, silence, a second post, or a recap of
 * the refusal. Soft only: the scenario gates routing, this grades the reply.
 */
export const computerTargetProfiles = {
    'computer-target-screenshot-macbook': {
        cap: 60,
        channel: [1, 2],
        maxQuestions: 1,
        result: (post) =>
            /\boffline\b|\bnot (?:connected|online|reachable)\b|\bisn'?t (?:connected|online|reachable)\b/iu.test(
                post.content
            ),
        spec: 'ADR0057-4',
    },
};

/**
 * Citations (ADR 0061). Asked to look up something current, a good teammate
 * answers in the channel with the fact and cites the page it read as a
 * Markdown link, once. Wrong: a bare claim with no link, a raw provider
 * marker, a pasted search-result list, or an offer to do more.
 */
export const citationProfiles = {
    'web-search-cites-links': {
        cap: 60,
        channel: [1, 2],
        maxQuestions: 0,
        result: (post) => /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/u.test(post.content),
        spec: 'ADR0061',
    },
};

export const computerTargetJudge = {
    no: 'The posts never say the MacBook is offline or unreachable, pass off another machine as the MacBook, or add a recap, a plan, or an offer.',
    question:
        "Read the human's message and the agent's channel posts in order. Did the agent tell the human, briefly and once, that their MacBook is offline so it could not take the screenshot?",
    yes: 'The posts say plainly that the MacBook is offline or not connected, so no screenshot was taken, with nothing extra.',
};

/** Jev judge question for the placement eval; its yes-probability maps to 1-5 (pass bar 4). */
export const placementJudge = {
    no: 'The posts add anything beyond the answer, such as a recap, a plan, an offer, or extra questions, or they answer somewhere the human is not looking.',
    question:
        "Read the human's message and the agent's channel posts in order. Does this read like a focused coworker replying in Slack: answers what was asked, nothing extra, no recap, no offer?",
    yes: 'The posts answer exactly what was asked, where the human is looking, with nothing extra, no recap, and no offer.',
};
