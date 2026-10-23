// The eval registry: each named eval is a set of live agent-test scenarios
// (names under scripts/agent-tests/scenarios/) plus the grader profiles and
// judge applied to their runs. Scenario names must select exactly themselves
// through the harness's substring `--only` filter; evals.test.mjs enforces it.

import { UsageError } from './args.mjs';
import {
    attentionProfiles,
    githubTriggerProfiles,
    linearTriggerProfiles,
    placementJudge,
    placementProfiles,
} from './profiles.mjs';

export const evals = {
    placement: {
        judge: placementJudge,
        profiles: placementProfiles,
        scenarios: [
            'placement-found-the-kit-files',
            'placement-quick-fact',
            'ack-reaction-thanks',
            'thread-reply-stays-in-thread',
            'solo-progress-threads-on-ack',
            'placement-recommendation',
        ],
        summary:
            'Answers land where the asker looks (inline reply, or the Thread they chose), say only what was asked, and stop.',
    },
    attention: {
        judge: null,
        // Serial: these scenarios assert silence and wake order.
        lanes: 1,
        profiles: attentionProfiles,
        scenarios: [
            'mention-wakes-only-addressed',
            'fyi-silence-dm',
            'human-ask-reply-wakes',
            'task-thread-routing',
            'reminder-schedule-and-fire',
        ],
        summary:
            'Agents wake for what is addressed to them, stay quiet on FYIs, ask before irreversible acts, claim tasks, and follow up on schedule.',
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
    // Heartbeat runs start through the dev-only `dev.startHeartbeat` trigger, seed
    // chat history without waking the Agent, and overwrite MEMORY.md on the stack's
    // own Computer. Serial: each run takes the Agent's one turn slot and the
    // controlled MCP scenarios share the model budget. Word quality is scored out of
    // band by scripts/agent-tests/heartbeat-grade.mjs (`heartbeatProfiles`).
    heartbeat: {
        judge: null,
        lanes: 1,
        profiles: {},
        scenarios: [
            'heartbeat-learns-unsaved-correction',
            'heartbeat-quiet-day-control',
            'heartbeat-follows-up-dropped-promise',
            'heartbeat-surfaces-new-signal',
            'heartbeat-nothing-new-control',
            'heartbeat-reports-unhandled-standing-item',
            'heartbeat-stale-loose-end-control',
            'heartbeat-quiet-run-awareness',
            'heartbeat-lead-dedupe',
        ],
        summary:
            'A nightly heartbeat learns a correction the Agent only acknowledged and follows up a dropped promise; a daytime heartbeat reports a new signal or a still-unhandled item once with a heads-up, stays quiet otherwise, leaves stale loose ends alone, and two Agents answer a shared question once without duplicate research.',
    },
    // Work that leaves the chat: Cloud Agents, MCP connections, Triggers, and Files.
    // cloud-launch-and-link needs Cursor access.
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
    // GitHub and Linear Triggers on a GitHub installation and a Linear workspace
    // seeded on the eval stack itself: no GitHub or Linear account. The Linear
    // fake behind HAUS_LINEAR_API_ORIGIN resolves names. Serial: the GitHub
    // scenarios share an `acme` installation and the Linear ones the fake's port.
    triggers: {
        judge: null,
        lanes: 1,
        profiles: { ...githubTriggerProfiles, ...linearTriggerProfiles },
        scenarios: [
            'github-trigger-ci-setup',
            'github-trigger-fire-reply',
            'linear-trigger-setup',
            'linear-trigger-fire-reply',
        ],
        summary:
            'Agents set up a GitHub CI-failure or Linear state-transition Trigger from a plain ask and answer its fire once, top level, with --cause.',
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
