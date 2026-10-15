// A GitHub App installation seeded on the eval stack's own Server, so GitHub
// Trigger scenarios run with no real GitHub account and no call to github.com.
// The stack's tRPC cannot bind an installation without GitHub, so the rows go
// in through the stack's PostgreSQL, shaped like
// apps/server/test/github-trigger-seed.ts: a connected `github` connection the
// worker holds a grant on, and an active installation whose access cache is
// fresh and reaches one repository. Deliveries are signed with the stack's
// own App webhook secret (HAUS_GITHUB_APP_WEBHOOK_SECRET, resolved by varlock).

import { createHmac } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { SQL } from 'bun';
import { createDevStackStatePaths } from '../dev-stack-shared.mjs';
import { createAgentAuthor } from './author.mjs';

export const githubAccount = 'acme';
const idAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const ciPermissions = {
    actions: 'read',
    checks: 'read',
    contents: 'read',
    metadata: 'read',
    pull_requests: 'read',
};

/**
 * Seeds the world and returns it with `cleanup()`, which tombstones the
 * installation and removes the connection and grant. Triggers are the
 * scenario's to delete first.
 */
export async function seedGithubWorld(kit, worker, { repositoryName = 'api' } = {}) {
    const webhookSecret = process.env.HAUS_GITHUB_APP_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error(
            'GitHub Trigger scenarios need HAUS_GITHUB_APP_WEBHOOK_SECRET: run them through `bun run eval`, or wrap test:agents in `bunx varlock run --`.'
        );
    }
    const sql = openStackDatabase();
    const connectionId = `mcp_${opaque(16)}`;
    const installationRowId = `ghi_${opaque(16)}`;
    // GitHub ids are global on the stack, so each seed draws fresh ones.
    const installationId = 9_000_000_000 + randomInt(900_000_000);
    const repository = {
        full_name: `${githubAccount}/${repositoryName}`,
        html_url: `https://github.com/${githubAccount}/${repositoryName}`,
        id: 8_000_000_000 + randomInt(900_000_000),
        name: repositoryName,
        owner: { id: 99, login: githubAccount, type: 'Organization' },
        private: true,
    };
    const now = new Date();
    await sql`
        insert into mcp_connections (id, server_id, name, url, auth, connected, header_names, tools, preset)
        values (${connectionId}, ${kit.serverId}, 'GitHub', 'https://api.githubcopilot.com/mcp/',
                'oauth', true, '{}', '{}', 'github')
    `;
    await sql`
        insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${kit.serverId}, ${worker.id}, ${connectionId})
    `;
    await sql`
        insert into github_installations
            (id, server_id, connection_id, installation_id, account_id, account_login, account_type,
             repository_selection, permissions, events, status, accessible_repository_ids,
             access_synced_at, created_at, updated_at, synced_at)
        values (${installationRowId}, ${kit.serverId}, ${connectionId}, ${installationId}, 99,
                ${githubAccount}, 'Organization', 'selected', ${ciPermissions}::jsonb,
                '{workflow_run,workflow_job,check_suite,check_run}', 'active',
                ${`{${repository.id}}`}::bigint[], ${now}, ${now}, ${now}, ${now})
    `;

    async function cleanup() {
        try {
            await sql`
                update github_installations
                set status = 'removed', removed_at = now(), connection_id = null, updated_at = now()
                where id = ${installationRowId}
            `;
            await sql`delete from agent_mcp_connection_grants where connection_id = ${connectionId}`;
            await sql`delete from mcp_connections where id = ${connectionId}`;
        } finally {
            await sql.close();
        }
    }

    return {
        cleanup,
        connectionId,
        installationId,
        installationRowId,
        repository,
        /** POSTs one delivery to the Server's GitHub webhook the way GitHub does. */
        postDelivery: (event, payload) =>
            postGithubDelivery(kit.harness.serverUrl, webhookSecret, event, {
                ...payload,
                installation: { id: installationId },
                organization: { id: 99, login: githubAccount },
                repository,
                sender: { id: 501, login: 'octocat', type: 'User' },
            }),
    };
}

/**
 * Creates a `github` Trigger through the Agent route, as `haus trigger create`
 * would, anchored on `messageId`. The route takes `account` on the change and
 * `installationId` before it, so an invalid-shape refusal retries the older one.
 */
export async function createAgentGithubTrigger(
    kit,
    { agentId, chatId, github, messageId, ...rest }
) {
    const author = createAgentAuthor({
        repositoryRoot: process.cwd(),
        serverId: kit.serverId,
        serverUrl: kit.harness.serverUrl,
        stamp: kit.stamp,
    });
    const token = await author.mint(agentId, chatId);
    const { installationRowId, ...config } = github;
    const attempts = [
        { ...config, account: githubAccount },
        { ...config, installationId: installationRowId },
    ];
    let last = null;
    for (const attempt of attempts) {
        const response = await fetch(`${kit.harness.serverUrl}/api/agent/triggers`, {
            body: JSON.stringify({ ...rest, github: attempt, kind: 'github', messageId }),
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            method: 'POST',
        });
        const payload = await response.json().catch(() => null);
        if (response.ok) {
            return payload;
        }
        last = { payload, status: response.status };
        if (!(response.status === 400 && /request was invalid/iu.test(JSON.stringify(payload)))) {
            break;
        }
    }
    throw new Error(
        `Agent github Trigger create failed (${last?.status}): ${JSON.stringify(last?.payload)?.slice(0, 300)}`
    );
}

/** The stack's PostgreSQL over TCP; its port is the socket file's suffix. */
function openStackDatabase() {
    const { postgresSocketRoot } = createDevStackStatePaths({
        baseEnvironment: process.env,
        repositoryRoot: process.cwd(),
    });
    const socket = readdirSync(postgresSocketRoot).find((entry) =>
        /^\.s\.PGSQL\.\d+$/u.test(entry)
    );
    if (!socket) {
        throw new Error(`No PostgreSQL socket under ${postgresSocketRoot}; is the dev stack up?`);
    }
    const port = socket.split('.').at(-1);
    return new SQL(`postgres://haus@127.0.0.1:${port}/haus`);
}

async function postGithubDelivery(serverUrl, secret, event, payload) {
    const body = JSON.stringify(payload);
    const guid = crypto.randomUUID();
    const response = await fetch(`${serverUrl}/api/github/webhook`, {
        body,
        headers: {
            'content-type': 'application/json',
            'user-agent': 'GitHub-Hookshot/agent-tests',
            'x-github-delivery': guid,
            'x-github-event': event,
            'x-github-hook-installation-target-type': 'integration',
            'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
        },
        method: 'POST',
    });
    return { body: await response.json().catch(() => null), guid, status: response.status };
}

function opaque(length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return [...bytes].map((byte) => idAlphabet[byte % idAlphabet.length]).join('');
}

function randomInt(max) {
    return crypto.getRandomValues(new Uint32Array(1))[0] % max;
}
