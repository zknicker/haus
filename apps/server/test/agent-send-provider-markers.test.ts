import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
const cite = [0xe2_00, 'cite', 0xe2_02, 'turn751610search4', 0xe2_01]
    .map((part) => (typeof part === 'number' ? String.fromCodePoint(part) : part))
    .join('');

async function storedContent(messageId: string) {
    const [row] = (await fixture.harness.sql`
        select content from chat_messages where id = ${messageId}
    `) as Array<{ content: string }>;
    return row?.content;
}

test('an Agent send stores its body without provider reference markers', async () => {
    const runner = await fixture.mintRunner('run_send_markers_strip');
    const response = await fixture.post('/api/agent/messages/send', runner, {
        content: `January 15, 2027 is the next federal quarterly estimated-tax deadline, for the fourth payment toward your 2026 taxes. ${cite}`,
        nonce: 'markers_strip',
        target: '#product',
    });
    const sent = response.body as { message?: { content: string; id: string }; state?: string };

    expect(response.status).toBe(200);
    expect(sent.message?.content).toBe(
        'January 15, 2027 is the next federal quarterly estimated-tax deadline, for the fourth payment toward your 2026 taxes.'
    );
    expect(await storedContent(sent.message?.id ?? '')).toBe(sent.message?.content);
});

test('an Agent send that is only markers fails like an empty body', async () => {
    const runner = await fixture.mintRunner('run_send_markers_empty');
    const response = await fixture.post('/api/agent/messages/send', runner, {
        content: ` ${cite}\n`,
        nonce: 'markers_empty',
        target: '#product',
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'MISSING_CONTENT' });
});
