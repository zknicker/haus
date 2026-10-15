// The eval registry: each named eval is a set of live agent-test scenarios
// (names under scripts/agent-tests/scenarios/) plus the grader profiles and
// judge applied to their runs. Scenario names must select exactly themselves
// through the harness's substring `--only` filter; evals.test.mjs enforces it.

import { UsageError } from './args.mjs';
import { attentionProfiles, placementJudge, placementProfiles } from './profiles.mjs';

export const evals = {
    placement: {
        judge: placementJudge,
        profiles: placementProfiles,
        scenarios: [
            'placement-found-the-kit-local',
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
    // Work that leaves the chat: Cloud Agents, MCP connections, and Triggers.
    // cloud-launch-and-link needs Cursor access. Files scenarios need R2 and stay opt-in.
    tools: {
        judge: null,
        profiles: {},
        scenarios: [
            'cloud-launch-and-link',
            'mcp-granted-lookup',
            'webhook-secret-stays-out-of-chat',
        ],
        summary:
            'Agents launch and link cloud work, use only granted MCP connections, and keep Trigger secrets out of chat.',
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
