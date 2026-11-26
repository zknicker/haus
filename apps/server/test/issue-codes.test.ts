import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createTestProject } from './project.fixture.ts';

const fixture = agentCreationFixture();

test('concurrent Issues take distinct codes from their Project key, and the key is then fixed', async () => {
    const { owner, serverId } = fixture;
    const web = await createTestProject(owner, { name: 'web', serverId });
    await owner.trpc.project.update.mutate({ chatId: web.id, key: 'SITE', serverId });

    const created = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
            owner.trpc.issue.create.mutate({ projectId: web.id, serverId, title: `Page ${index}` })
        )
    );
    const numbers = created.map(({ issue }) => issue.number).sort((left, right) => left - right);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(created.map(({ issue }) => issue.code)).size).toBe(8);
    expect(created.every(({ issue }) => issue.code === `SITE-${issue.number}`)).toBe(true);

    const [listed] = (await owner.trpc.project.list.query({ serverId })).filter(
        (project) => project.chatId === web.id
    );
    expect(listed).toMatchObject({ key: 'SITE', keyEditable: false });
    await expect(
        owner.trpc.project.update.mutate({ chatId: web.id, key: 'WWW', serverId })
    ).rejects.toThrow('Issues already carry this Project’s key');

    const { issue } = await owner.trpc.issue.get.query({ code: 'SITE-3', serverId });
    expect(issue).toMatchObject({
        number: 3,
        projectId: web.id,
        state: { id: 'todo', type: 'open' },
    });
});

test('a number is never reused: the ledger only rises past numbers already given out', async () => {
    const { harness, owner, serverId } = fixture;
    const docs = await createTestProject(owner, { name: 'docs', serverId });
    const [entry] = (await harness.sql`
        update task_keys set next_number = 41
        where id = (select task_key_id from projects where chat_id = ${docs.id})
        returning key
    `) as { key: string }[];
    const { issue } = await owner.trpc.issue.create.mutate({
        projectId: docs.id,
        serverId,
        state: 'done',
        title: 'Old work carried forward',
    });
    expect(issue.code).toBe(`${entry?.key}-41`);
    expect(issue.closedAt).not.toBeNull();
    const [ledger] = (await harness.sql`
        select next_number from task_keys
        where id = (select task_key_id from projects where chat_id = ${docs.id})
    `) as { next_number: number }[];
    expect(ledger?.next_number).toBe(42);
});

test('a Server holding Issues purges completely', async () => {
    const { harness, orbitAgentId, owner, serverId } = fixture;
    const ops = await createTestProject(owner, { name: 'ops', serverId });
    const label = await owner.trpc.taskLabel.create.mutate({ name: 'Ops', serverId });
    const { issue: parent } = await owner.trpc.issue.create.mutate({
        assignee: { agentId: orbitAgentId, kind: 'captain' },
        labelIds: [label.label?.id ?? ''],
        projectId: ops.id,
        serverId,
        title: 'Keep the lights on',
    });
    await owner.trpc.issue.create.mutate({
        parentId: parent.id,
        projectId: ops.id,
        serverId,
        title: 'Renew the certificate',
    });
    await owner.trpc.issue.comment.mutate({ body: 'Due Friday.', issueId: parent.id, serverId });
    const counts = async () =>
        (await harness.sql`
            select
                (select count(*)::int from issues where server_id = ${serverId}) as issues,
                (select count(*)::int from issue_events where server_id = ${serverId}) as events,
                (select count(*)::int from issue_comments where server_id = ${serverId}) as comments
        `) as Record<string, number>[];
    expect((await counts())[0]?.comments).toBe(1);

    await harness.sql.begin(async (tx) => {
        await tx`delete from servers where id = ${serverId}`;
    });
    expect(await counts()).toEqual([{ comments: 0, events: 0, issues: 0 }]);
});
