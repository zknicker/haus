import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// An open live turn re-reads its journal when the Computer announces a change,
// instead of polling the Computer every second.
let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let computer: WebSocket;
let serverId: string;
const computerId = 'cmp_journalchanges00';
const agentId = 'agt_journalchanges00';
const credential = 'journal-changes-computer-credential';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('clerk_journal_owner'));
    outsider = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('clerk_journal_outsider')
    );
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Journal', slug: 'journal-changes' })
    ).id;
    await outsider.trpc.server.create.mutate({ displayName: 'Elsewhere', slug: 'elsewhere' });
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_journal_owner'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${user?.id}, ${digest(credential)})
    `;
    await harness.sql`
        insert into agents (
            id, server_id, handle, display_name, home_timezone,
            computer_id, desired_runtime_id, desired_model_id
        )
        values (
            ${agentId}, ${serverId}, 'journal-scout', 'Scout', 'America/New_York',
            ${computerId}, 'codex', 'gpt-5.6-sol'
        )
    `;
    computer = new WebSocket(computerSocketUrl());
    await new Promise<void>((resolve, reject) => {
        computer.addEventListener('open', () => resolve(), { once: true });
        computer.addEventListener('error', () => reject(new Error('socket failed')), {
            once: true,
        });
    });
    const accepted = new Promise((resolve) => {
        computer.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
            once: true,
        });
    });
    computer.send(JSON.stringify(bootstrapFrame()));
    expect(await accepted).toEqual({ mode: 'ordinary', type: 'bootstrap-accepted' });
});

afterAll(async () => {
    computer?.close();
    owner?.close();
    outsider?.close();
    await harness?.close();
});

test('an open turn view hears its own run change and no other run', async () => {
    const changes: unknown[] = [];
    const started = Promise.withResolvers<void>();
    const subscription = owner.trpc.agent.onExecutionJournal.subscribe(
        { agentId, runId: 'run_watched', serverId },
        {
            onData: (change) => changes.push(change),
            onError: (error) => started.reject(error),
            onStarted: () => started.resolve(),
        }
    );
    await started.promise;
    // tRPC reports started before the Server registers its listener.
    await Bun.sleep(100);

    computer.send(journalChanged('run_other'));
    computer.send(journalChanged('run_watched'));
    for (let attempt = 0; attempt < 200 && changes.length === 0; attempt += 1) {
        await Bun.sleep(10);
    }
    await Bun.sleep(100);
    subscription.unsubscribe();
    expect(changes).toEqual([{ agentId, runId: 'run_watched' }]);
});

test('someone outside the Server cannot watch its journals', async () => {
    const refused = Promise.withResolvers<unknown>();
    const subscription = outsider.trpc.agent.onExecutionJournal.subscribe(
        { agentId, runId: 'run_watched', serverId },
        { onData: () => undefined, onError: (error) => refused.resolve(error) }
    );
    expect(String(await refused.promise)).toMatch(/member|forbidden|not found/i);
    subscription.unsubscribe();
});

function journalChanged(runId: string) {
    return JSON.stringify({ agentId, runId, type: 'agent-execution-journal-changed' });
}

function bootstrapFrame() {
    return {
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential,
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '9.4.0',
        protocolVersion: computerProtocolVersion,
        type: 'bootstrap',
        update: {
            detail: null,
            phase: 'idle',
            targetVersion: null,
            updatedAt: '2026-10-09T12:00:00.000Z',
        },
    };
}

function digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function computerSocketUrl() {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
}
