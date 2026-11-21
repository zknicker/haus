import { expect, test } from 'bun:test';
import type { AgentThoughtFrame } from '@haus/api';
import { createAgentThoughts } from '../src/server-agents/agent-thought.ts';
import { at, fakeSummarizer } from './agent-thought-harness.ts';

const disclosure = 'The database password is hunter2 for staging access.';

const frames: AgentThoughtFrame[] = [
    reasoningFrame(disclosure),
    {
        agentId: 'agt_1',
        at,
        kind: 'phrase',
        runId: 'run_1',
        text: 'Checking the token: s3cr3t-staging',
        type: 'agent-thought',
    },
];

test('the local fallback never shows a disclosed credential', async () => {
    const thoughts = createAgentThoughts({ summarizer: null });
    for (const frame of frames) {
        expect(await thoughts.phrase(frame)).toBeNull();
    }
    expect(
        await thoughts.phrase(
            reasoningFrame('Let me compare the Halloween bids with last week before replying.')
        )
    ).toEqual({ stream: 'new', text: "I'm comparing the Halloween bids with last week" });
});

test('the summarizer only ever sees the masked credential', async () => {
    const summarizer = fakeSummarizer(async () => null);
    const thoughts = createAgentThoughts({ summarizer: summarizer.summarizer });
    for (const frame of frames) {
        expect(await thoughts.phrase(frame)).toBeNull();
    }
    const seen = JSON.stringify(summarizer.seen);
    expect(seen).not.toContain('hunter2');
    expect(seen).not.toContain('s3cr3t-staging');
    expect(seen).toContain('[redacted]');
});

const githubToken = `ghp_${'a1B2c3D4e5'.repeat(3)}abcdef`;
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEifQ.c2lnbmF0dXJlc2lnbmF0dXJl';
const tokenFrame = reasoningFrame(`Let me call the API with ${githubToken} and ${jwt} next.`);

test('the local fallback never shows a token-shaped secret', async () => {
    const thoughts = createAgentThoughts({ summarizer: null });
    const phrased = await thoughts.phrase(tokenFrame);
    const shown = JSON.stringify(phrased);
    expect(shown).not.toContain(githubToken);
    expect(shown).not.toContain(jwt);
    expect(phrased).toBeNull();
});

test('the summarizer never receives a token-shaped secret', async () => {
    const summarizer = fakeSummarizer(async () => null);
    const thoughts = createAgentThoughts({ summarizer: summarizer.summarizer });
    await thoughts.phrase(tokenFrame);
    const seen = JSON.stringify(summarizer.seen);
    expect(seen).not.toContain(githubToken);
    expect(seen).not.toContain(jwt);
    expect(seen).toContain('[redacted]');
});

function reasoningFrame(reasoning: string) {
    const frame: AgentThoughtFrame = {
        agentId: 'agt_1',
        at,
        kind: 'reasoning',
        reasoning,
        runId: 'run_1',
        type: 'agent-thought',
    };
    return frame;
}
