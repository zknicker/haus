// The eval registry: each named eval is a set of live agent-test scenarios
// (names under scripts/agent-tests/scenarios/) plus the grader profiles and
// judge applied to their runs. Scenario names must select exactly themselves
// through the harness's substring `--only` filter; evals.test.mjs enforces it.

import { UsageError } from './args.mjs';
import {
    attentionProfiles,
    githubTriggerProfiles,
    placementJudge,
    placementProfiles,
} from './profiles.mjs';

const placementScenarios = [
    'placement-found-the-kit-files',
    'placement-quick-fact',
    'ack-reaction-thanks',
    'placement-recommendation',
    'placement-off-topic-quick-question',
];

const attentionScenarios = [
    'mention-wakes-only-addressed',
    'fyi-silence-dm',
    'human-ask-reply-wakes',
    'claim-then-inline-reply',
    'reminder-schedule-and-fire',
];

export const evals = {
    placement: {
        judge: placementJudge,
        profiles: placementProfiles,
        scenarios: placementScenarios,
        summary: 'Answers land inline where the asker looks, say only what was asked, and stop.',
    },
    // Side work in a purpose channel, with the one-off control that must stay
    // inline. The multi-round scenario asserts its own structure; its rate is
    // the measurement.
    'side-work': {
        judge: null,
        profiles: {
            'placement-off-topic-quick-question':
                placementProfiles['placement-off-topic-quick-question'],
        },
        scenarios: ['side-work-stays-beside-channel', 'placement-off-topic-quick-question'],
        summary:
            'Substantial off-topic work asked in a purpose channel does not take over the channel, while a one-off answer stays a single inline reply.',
    },
    attention: {
        judge: null,
        // Serial: these scenarios assert silence and wake order.
        lanes: 1,
        profiles: attentionProfiles,
        scenarios: attentionScenarios,
        summary:
            'Agents wake for what is addressed to them, stay quiet on FYIs, ask before irreversible acts, claim work before replying inline, and follow up on schedule.',
    },
    // Both overwrite MEMORY.md on the stack's own Computer. Rule quality is
    // scored out of band by scripts/agent-tests/memory-feedback-grade.mjs.
    memory: {
        judge: null,
        profiles: {},
        scenarios: ['memory-feedback-implicit', 'memory-feedback-control'],
        summary:
            'Feedback in passing becomes a Standing Preference that survives a session reset; no feedback, no rule change.',
    },
    // Work that leaves the chat: Cloud Agents, MCP connections, Triggers, and Files.
    tools: {
        judge: null,
        profiles: {},
        scenarios: [
            'cloud-launch-and-link',
            'mcp-granted-lookup',
            'webhook-secret-stays-out-of-chat',
            'shared-artifact-discovery',
        ],
        summary:
            'Agents launch and link cloud work, use only granted MCP connections, keep Trigger secrets out of chat, and share files through Files.',
    },
    // GitHub Triggers on a GitHub installation seeded on the eval stack itself:
    // no GitHub account. Serial: the scenarios share an `acme` installation.
    triggers: {
        judge: null,
        lanes: 1,
        profiles: githubTriggerProfiles,
        scenarios: ['github-trigger-ci-setup', 'github-trigger-fire-reply'],
        summary:
            'Agents set up a GitHub CI-failure Trigger from a plain ask and answer its fire once, top level, with --cause.',
    },
    'task-intake': {
        judge: null,
        lanes: 1,
        profiles: {},
        scenarios: [
            'task-intake-quick-fact-replies',
            'task-intake-small-fix-in-turn',
            'task-intake-multi-step-opens-task',
            'task-intake-cloud-launch-on-task',
            'task-intake-reminder-short-post',
            'task-intake-reminder-starts-work',
            'task-intake-trigger-needs-fix',
            'task-intake-trigger-acknowledge',
            'task-intake-findings-sibling-tasks',
            'task-intake-cloud-finish-reports-in-task',
            'task-intake-dm-work-routes-to-channel',
        ],
        summary:
            "Work the reply will not finish becomes a Task opened where the work belongs, from a human, a Reminder, a Trigger, or the Agent's own findings; work the reply finishes is just answered, and a claim, not a Task, marks ownership.",
    },
    'task-pacing': {
        judge: null,
        lanes: 1,
        profiles: {},
        scenarios: [
            'task-pacing-assigned-queue',
            'task-pacing-blocked-takes-next',
            'task-pacing-self-started-side-by-side',
        ],
        summary:
            'Tasks a person assigns are worked one at a time, most urgent first, skipping one blocked on a person; Tasks the Agent starts itself may run side by side.',
    },
    // Two Agents and a human in one channel, each scenario with a decoy the
    // Manual card warns against. Serial: the scenarios assert silence.
    room: {
        judge: null,
        lanes: 1,
        profiles: {},
        scenarios: [
            'room-pickup-reaction-on-it',
            'room-task-claimed-by-peer',
            'room-peer-handoff-with-evidence',
            'room-pending-ask-peer-guesses',
            'room-reminder-fires-mid-conversation',
            'room-visual-not-caption-only',
        ],
        summary:
            'In a shared channel, Agents pick up visibly, leave peer-claimed work alone, act on handoffs, wait for the human, place reminder answers, and draw visuals by the skill.',
    },
};

/** The registered eval, or a UsageError naming the known ones. */
export function resolveEval(name) {
    const entry = evals[name];
    if (!entry) {
        throw new UsageError(`No eval named ${name}. Known: ${Object.keys(evals).join(', ')}.`);
    }
    if (entry.scenarios.length === 0) {
        throw new UsageError(`The ${name} eval has no scenarios yet.`);
    }
    return { name, ...entry };
}
