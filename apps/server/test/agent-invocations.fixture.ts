import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { WebSocket } from 'ws';
import type { InvocationClock } from '../src/agent-invocations/invocation-clock.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { type RunnerFrame, testRunnerToken } from './runner.fixture.ts';

export interface FrameClient {
    close(): void;
    closed: Promise<void>;
    frames: RunnerFrame[];
    next(predicate: (frame: RunnerFrame) => boolean): Promise<RunnerFrame>;
    send(frame: unknown): void;
}

export interface InvocationHarness {
    agentId: string;
    close(): Promise<void>;
    computerCredential: string;
    computerId: string;
    harness: HausServerHarness;
    owner: HausClient;
    serverId: string;
}

export function manualInvocationClock() {
    const scheduled: { callback: () => void; cancelled: boolean; delayMs: number }[] = [];
    const clock: InvocationClock = {
        schedule(callback, delayMs) {
            const timer = { callback, cancelled: false, delayMs };
            scheduled.push(timer);
            return { cancel: () => (timer.cancelled = true) };
        },
    };
    const live = () => scheduled.filter((timer) => !timer.cancelled);
    return {
        clock,
        fireAll() {
            for (const timer of live()) {
                timer.cancelled = true;
                timer.callback();
            }
        },
        live: () => live().map((timer) => timer.delayMs),
    };
}

export async function startInvocationHarness(input: { clock?: InvocationClock; slug: string }) {
    const harness = await startHausServerHarness({
        agentLoop: 'runner',
        invocationClock: input.clock,
        runnerToken: testRunnerToken,
    });
    const subject = `user_${input.slug}`;
    harness.humans.setVerifiedEmails(subject, [`${input.slug}@haus.test`]);
    const owner = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    const serverId = (
        await owner.trpc.server.create.mutate({ displayName: input.slug, slug: input.slug })
    ).id;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId,
    });
    const computerId = `cmp_${input.slug.replaceAll('-', '').padEnd(16, 'x').slice(0, 16)}`;
    const computerCredential = `computer-credential-${input.slug}`;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId}, ${serverId}, ${harness.humans.userIdForSubject(subject)},
            ${digest(computerCredential)},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    const agentId = (
        await owner.trpc.agent.create.mutate({
            computerId,
            displayName: 'Orbit',
            handle: 'orbit',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runtimeId: 'codex',
            serverId,
        })
    ).agent.id;
    const started: InvocationHarness = {
        agentId,
        close: async () => {
            owner.close();
            await harness.close();
        },
        computerCredential,
        computerId,
        harness,
        owner,
        serverId,
    };
    return started;
}

export async function connectComputer(
    harness: HausServerHarness,
    credential: string,
    protocolVersion = computerProtocolVersion
) {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    const client = frameClient(new WebSocket(url), {
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential,
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '1.1.2',
        protocolVersion,
        type: 'bootstrap',
        update: {
            detail: null,
            phase: 'idle',
            targetVersion: null,
            updatedAt: '2026-11-19T12:00:00.000Z',
        },
    });
    await client.next((frame) => frame.type === 'bootstrap-accepted');
    return client;
}

export function invocationRequest(agentId: string, runId: string, toolCallId: string) {
    return {
        agentId,
        operation: { command: 'ls drive', kind: 'bash' },
        runId,
        seq: 0,
        toolCallId,
        type: 'invocation-request',
    };
}

export function digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function frameClient(socket: WebSocket, hello: unknown) {
    const frames: RunnerFrame[] = [];
    const waiters: {
        predicate: (frame: RunnerFrame) => boolean;
        resolve(frame: RunnerFrame): void;
    }[] = [];
    socket.on('message', (raw) => {
        const frame = JSON.parse(raw.toString()) as RunnerFrame;
        frames.push(frame);
        for (const waiter of waiters.filter((candidate) => candidate.predicate(frame))) {
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve(frame);
        }
    });
    socket.once('open', () => socket.send(JSON.stringify(hello)));
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    const client: FrameClient = {
        close: () => socket.close(),
        closed,
        frames,
        next: (predicate) =>
            new Promise((resolve) => {
                const seen = frames.find(predicate);
                if (seen) {
                    resolve(seen);
                    return;
                }
                waiters.push({ predicate, resolve });
            }),
        send: (frame) => socket.send(JSON.stringify(frame)),
    };
    return client;
}
