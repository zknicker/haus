import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0152_repos-belong-to-the-server';

test('0152 lists every Worker and Project repo once, lower-cased, per Server, and drops the Project repo tables', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-repos-belong-to-the-server-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const through = (idx: number) =>
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
            });
        await writeFile(journalPath, through(150));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedRepos(database);

        await writeFile(journalPath, through(151));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        expect(
            await database`SELECT server_id, repository FROM repos
                ORDER BY server_id COLLATE "C", repository COLLATE "C"`
        ).toEqual([
            { repository: 'acme/api', server_id: 'srv_a' },
            { repository: 'acme/app', server_id: 'srv_a' },
            { repository: 'acme/core', server_id: 'srv_a' },
            { repository: 'acme/app', server_id: 'srv_b' },
        ]);
        expect(
            await database`SELECT id, repository, kept_worktree_path FROM workers ORDER BY id`
        ).toEqual([
            { id: 'wkr_aaaaaaaaaaaaaaaa', kept_worktree_path: null, repository: 'Acme/App' },
            { id: 'wkr_bbbbbbbbbbbbbbbb', kept_worktree_path: null, repository: 'acme/app' },
            { id: 'wkr_cccccccccccccccc', kept_worktree_path: null, repository: 'ACME/API' },
            { id: 'wkr_dddddddddddddddd', kept_worktree_path: null, repository: 'Acme/App' },
        ]);
        expect(
            await database`SELECT table_name FROM information_schema.tables
                WHERE table_name IN ('project_repos', 'project_repo_links', 'repo_folders')
                ORDER BY table_name`
        ).toEqual([{ table_name: 'repo_folders' }]);
        expect(
            await refusal(
                database`INSERT INTO repos (server_id, repository) VALUES ('srv_a', 'Acme/Up')`
            )
        ).toContain('"repos_repository_shape"');
        expect(
            await refusal(
                database`INSERT INTO repos (server_id, repository) VALUES ('srv_gone', 'acme/app')`
            )
        ).toContain('"repos_server_fk"');
        expect(
            await database`SELECT confdeltype FROM pg_constraint WHERE conname = 'repos_server_fk'`
        ).toEqual([{ confdeltype: 'c' }]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

function refusal(query: PromiseLike<unknown>) {
    return query.then(
        () => 'accepted',
        (cause: Error) => cause.message
    );
}

async function seedRepos(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name)
            VALUES ('srv_a', 'a', 'A'), ('srv_b', 'b', 'B')`;
        await tx`INSERT INTO workers (id, server_id, agent_id, carrier_computer_id, place,
                repository, task_id, title, closed_at)
            VALUES
                ('wkr_aaaaaaaaaaaaaaaa', 'srv_a', 'agt_a', 'cmp_a', 'cursor', 'Acme/App', null, 'One', now()),
                ('wkr_bbbbbbbbbbbbbbbb', 'srv_a', 'agt_a', 'cmp_a', 'claude', 'acme/app', null, 'Two', now()),
                ('wkr_cccccccccccccccc', 'srv_a', 'agt_a', 'cmp_a', 'cursor', 'ACME/API', null, 'Three', now()),
                ('wkr_dddddddddddddddd', 'srv_b', 'agt_b', 'cmp_b', 'cursor', 'Acme/App', null, 'Four', now())`;
        await tx`INSERT INTO project_repos (id, server_id, project_id, repository)
            VALUES ('prp_aaaaaaaaaaaaaaaa', 'srv_a', 'cht_ops', 'Acme/Core')`;
    });
}
