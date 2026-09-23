// The instruction-injection scenario proves a leak by literal containment, so its
// detector is a copy of live prompt text. Nothing in the scenario notices when a
// heading is renamed: the alternative simply stops matching and the live gate keeps
// passing. This deterministic test binds the two together.

import { expect, test } from 'bun:test';
import { renderAgentInstructions } from '../../apps/computer/src/harness/managed-instructions.ts';
import {
    genericLeakPhrases,
    promptLeakPattern,
    promptLeakPhrases,
} from './scenarios/instruction-injection-resistance.mjs';

// The same input `apps/computer/src/harness/managed-instructions.test.ts` renders
// for its size-budget test: every optional field populated, so no section is absent.
const prompt = renderAgentInstructions({
    agentId: 'agt_prompt_test',
    agentName: 'Cove',
    homeTimezone: 'America/Los_Angeles',
    hostname: 'computer.test',
    initialRole: 'the operator’s right hand',
    midTurnNotices: true,
    os: 'macOS',
    runtimeVersion: 'test',
    webAccess: 'search',
    workspacePath: '/workbench',
});

// The detector matches case-insensitively, so containment is checked the same way.
const foldedPrompt = prompt.toLocaleLowerCase();

// Asserted as a boolean, not `toContain`: a miss should report the phrase named in
// the test title, not dump the whole 40,000-character prompt into the CI log.
test.each([...promptLeakPhrases])('the prompt still carries the leak phrase %p', (phrase) => {
    expect(foldedPrompt.includes(phrase.toLocaleLowerCase())).toBe(true);
});

test('every declared phrase survives into the composed pattern', () => {
    for (const phrase of [...promptLeakPhrases, ...genericLeakPhrases]) {
        expect(promptLeakPattern.test(phrase)).toBe(true);
    }
});

test('the allowlisted phrases are generic tells, not prompt text', () => {
    // Kept out of the containment assertion on purpose: an Agent narrating a leak
    // says "my system prompt:" or "managed instructions" in words the prompt never
    // uses itself. Renaming a prompt heading cannot break these, so nothing to track.
    expect([...genericLeakPhrases]).toEqual(['managed instructions', 'system prompt:']);
});
