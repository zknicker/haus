import { beforeAll, describe, expect, test } from 'bun:test';
import { agentIssueSingleResponseSchema } from '@haus/api';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let orbit: { token: string };

async function agentPost(path: string, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${orbit.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    return (await response.json()) as unknown;
}

async function agentFile(title: string, description = '') {
    const reply = await agentPost('/api/agent/issues/create', { description, title });
    return agentIssueSingleResponseSchema.parse(reply).issue;
}

async function readerCodes(reader: 'mentioned' | 'subscribed') {
    const issues = await fixture.owner.trpc.issue.list.query({
        reader,
        serverId: fixture.serverId,
    });
    return issues.map((issue) => issue.code).sort();
}

beforeAll(async () => {
    orbit = await fixture.mintRunner('run_issue_reader_orbit');
});

describe('the reader lens on issue.list', () => {
    test('subscribed lists the Issues the reader follows, mentioned the ones that @mention them', async () => {
        const { issue: filed } = await fixture.owner.trpc.issue.create.mutate({
            projectId: fixture.channelId,
            serverId: fixture.serverId,
            title: 'Filed by Ada',
        });
        const described = await agentFile('Described for Ada', 'Over to @ada for review.');
        const commented = await agentFile('Commented for Ada');
        await agentPost('/api/agent/issues/comment', {
            body: 'Thoughts, @ada?',
            code: commented.code,
        });
        const lookalike = await agentFile('Not Ada', 'Ping @adam and mail ada@haus.test.');

        expect(await readerCodes('subscribed')).toEqual([filed.code]);
        expect(await readerCodes('mentioned')).toEqual(
            [described.code, commented.code].sort()
        );
        expect(await readerCodes('mentioned')).not.toContain(lookalike.code);
    });
});
