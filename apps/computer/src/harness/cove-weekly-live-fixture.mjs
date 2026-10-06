// Isolated native model fixture: real temporary Haus APIs, controlled turn delivery.
// No Computer daemon or production Server is contacted. Credentials are never recorded.
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { bridgeStoreDirForHost } from './bridge-bootstrap.ts';
import { coveGuidanceConflictNotice, coveTurnGuidanceNotice } from './cove-guidance-refresh.ts';
import { coveTestBootstrap } from './cove-weekly-bootstrap.mjs';
import {
    clearWeeklyConversation,
    sendWeeklyOwnerMessage,
    setWeeklyChannelArchived,
} from './cove-weekly-server-state.mjs';
import { composeWeeklyTurn, streamWeeklyTurn } from './cove-weekly-turn.mjs';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

export async function withWeeklyCove(
    fixture,
    run,
    {
        reportSuffix = '',
        legacyRepo = null,
        ordinary = false,
        homeTimezone = 'America/New_York',
    } = {}
) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-cove-weekly-')));
    const workspace = join(root, 'workspace');
    const homeDir = join(root, 'home');
    const runtime = makeDaemonRuntime();
    const bootstrap = await coveTestBootstrap(legacyRepo, ordinary);
    const subjectAgentId = ordinary ? fixture.orbitAgentId : fixture.coveAgentId;
    await bootstrap.seed(workspace);
    await fixture.harness
        .sql`update agents set home_timezone=${homeTimezone} where id=${subjectAgentId}`;
    await mkdir(join(root, 'bin'));
    const cli = bootstrap.cli;
    const cliPath = join(root, 'bin', 'haus-run.mjs');
    await writeFile(
        cliPath,
        `import {runAgentCli} from ${JSON.stringify(cli)}; process.exit(await runAgentCli(process.argv.slice(2)));`
    );
    await writeFile(
        join(root, 'bin', 'haus'),
        `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(cliPath)} "$@"\n`,
        { mode: 0o700 }
    );
    await fixture.harness
        .sql`insert into channel_agent_participants(server_id,chat_id,agent_id) values (${fixture.serverId},${fixture.channelId},${subjectAgentId}) on conflict do nothing`;
    const tokenPath = join(root, 'token');
    const localToken = `grta_${randomBytes(32).toString('base64url')}`;
    await writeFile(tokenPath, localToken, { mode: 0o600 });
    let runner;
    let turn;
    let lateMessage;
    let refuseOffers = false;
    const proxy = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            if (request.headers.get('authorization') !== `Bearer ${localToken}`) {
                return new Response('Unauthorized', { status: 401 });
            }
            const url = new URL(request.url);
            const body = request.method === 'GET' ? undefined : await request.text();
            if (url.pathname === '/api/agent/messages/send' && lateMessage) {
                const content = lateMessage;
                lateMessage = null;
                const news = await humanSend(content, `weekly-late-${turn.label}`);
                turn.lateMessageId = news.message.id;
            }
            if (
                refuseOffers &&
                url.pathname === '/api/agent/messages/send' &&
                /weekly|once a week|every week|each week/iu.test(
                    JSON.parse(body ?? '{}').content ?? ''
                )
            ) {
                refuseOffers = false;
                await setWeeklyChannelArchived(fixture, true);
            }
            const headers = new Headers(request.headers);
            headers.set('authorization', `Bearer ${runner.token}`);
            headers.delete('host');
            const response = await fetch(new URL(url.pathname + url.search, fixture.harness.url), {
                method: request.method,
                headers,
                body,
            });
            const responseText = await response.text();
            const record = {
                method: request.method,
                path: url.pathname,
                query: Object.fromEntries(url.searchParams),
                body: body ? JSON.parse(body) : null,
                status: response.status,
                result: JSON.parse(responseText),
            };
            turn.actions.push(record);
            await persistEvidence();
            return new Response(responseText, {
                status: response.status,
                headers: { 'content-type': 'application/json' },
            });
        },
    });
    const model = process.env.HAUS_LIVE_CODEX_MODEL ?? 'gpt-5.6-terra';
    const { instructions } = bootstrap.compose({
        agentId: subjectAgentId,
        agentName: ordinary ? 'Orbit' : 'Cove',
        homeTimezone,
        initialRole: ordinary ? 'Workstream assistant' : 'Onboarding Assistant',
        webAccess: null,
        workspacePath: workspace,
    });
    const agent = new HarnessAgent({
        harness: createHarnessForRuntime('codex', 'default', false, bridgeStoreDirForHost()),
        model,
        instructions,
        permissionMode: 'allow-all',
        sandbox: createLocalTrustedSandboxProvider({
            authProfiles: ['codex'],
            homeDir,
            rootDir: root,
            runtime,
            env: {
                HOME: homeDir,
                CODEX_HOME: join(homeDir, '.codex'),
                COREPACK_HOME: join(tmpdir(), 'haus-cove-corepack-cache'),
                PATH: `${join(root, 'bin')}:${process.env.PATH}`,
                HAUS_AGENT_ID: subjectAgentId,
                HAUS_SERVER_URL: proxy.url.toString(),
                HAUS_AGENT_TOKEN_FILE: tokenPath,
            },
        }),
        sandboxConfig: { workDir: 'workspace' },
    });
    let session;
    const evidence = {
        model,
        reasoning: 'default',
        synthetic: true,
        legacyBootstrap: bootstrap.legacy,
        transport: 'controlled native adapter, not Computer daemon',
        turns: [],
    };
    async function persistEvidence() {
        if (!process.env.HAUS_COVE_WEEKLY_REPORT) {
            return;
        }
        const reportPath = reportSuffix
            ? process.env.HAUS_COVE_WEEKLY_REPORT.replace(/\.json$/u, `-${reportSuffix}.json`)
            : process.env.HAUS_COVE_WEEKLY_REPORT;
        await writeFile(reportPath, JSON.stringify(evidence, null, 2));
    }
    const notes = join(workspace, 'notes', 'coordination.md');
    const humanSend = (content, nonce) => sendWeeklyOwnerMessage(fixture, content, nonce);
    const streamTurn = (prompt) =>
        streamWeeklyTurn({ agent, session, turn, notes, persistEvidence, prompt });
    const composed = (inbox, runId, frame = {}) =>
        composeWeeklyTurn({
            fixture,
            root,
            inbox,
            runId,
            frame: { homeTimezone, ...frame },
            agentId: subjectAgentId,
        });
    const driver = {
        workspace,
        agentId: subjectAgentId,
        model,
        notes,
        evidence,
        async cold() {
            await session.destroy();
            session = await agent.createSession();
        },
        async resume() {
            const saved = await session.stop();
            session = await agent.createSession({ resumeFrom: saved });
            evidence.resumed = true;
        },
        async fire(frame, { refresh = false } = {}) {
            runner = await fixture.mintRunner(
                frame.runId,
                subjectAgentId,
                fixture.channelId,
                false
            );
            turn = {
                label: 'scheduler-wake',
                actions: [],
                notesBefore: await readFile(notes, 'utf8').catch(() => null),
            };
            evidence.turns.push(turn);
            const context = ordinary
                ? null
                : refresh
                  ? (await import('./cove-guidance-refresh.ts')).coveGuidanceRefreshNotice
                  : coveTurnGuidanceNotice('cove');
            return await streamTurn(
                [context, composed(frame.inbox, frame.runId, frame)].filter(Boolean).join('\n\n')
            );
        },
        clearConversation: () => clearWeeklyConversation(fixture),
        async seedState(state) {
            evidence.seededState = state;
            await writeFile(
                notes,
                `# Coordination\nreview_offer_state: ${state}\nOffer concerns quiet #product coordination reviews. No new consent.\n`
            );
        },
        async ask(
            label,
            content,
            { conflict = false, newsBeforeSend = null, refuseOffer = false } = {}
        ) {
            runner = await fixture.mintRunner(
                `run_weekly_${label}`,
                subjectAgentId,
                fixture.channelId,
                false
            );
            const sent = await humanSend(content, `weekly-input-${label}`);
            turn = {
                label,
                input: content,
                actions: [],
                notesBefore: await readFile(notes, 'utf8').catch(() => null),
            };
            evidence.turns.push(turn);
            await persistEvidence();
            await fixture.harness
                .sql`update agent_delivery set active_run_id=${runner.runId}, active_run_chat_id=${fixture.channelId}, active_run_computer_id=${fixture.computerId}, active_run_runtime_id='codex', active_run_model_id=${model}, active_run_reasoning_effort='default', accepted_at=now(), dispatched_at=now() where agent_id=${subjectAgentId}`;
            // Match Computer: attest exactly the body composed into this prompt.
            const visible = await fetch(new URL('/api/agent/events/visible', proxy.url), {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${localToken}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    composed: true,
                    messages: [
                        {
                            chatId: fixture.channelId,
                            id: sent.message.id,
                            sequence: sent.message.sequence,
                        },
                    ],
                }),
            });
            if (!visible.ok) {
                throw new Error(`Composed receipt failed: ${visible.status}`);
            }
            lateMessage = newsBeforeSend;
            refuseOffers = refuseOffer;
            const context =
                bootstrap.legacy || ordinary
                    ? null
                    : conflict
                      ? coveGuidanceConflictNotice(['notes/onboarding_playbook.md'])
                      : coveTurnGuidanceNotice('cove');
            const item = {
                addressed: true,
                chatId: fixture.channelId,
                content: sent.message.content,
                createdAt: sent.message.createdAt,
                id: sent.message.id,
                senderHandle: 'ada',
                senderType: 'human',
                sequence: sent.message.sequence,
                target: '#product',
            };
            return await streamTurn(
                [context, composed([item], runner.runId)].filter(Boolean).join('\n\n')
            );
        },
    };
    try {
        session = await agent.createSession();
        await run(driver);
    } finally {
        await persistEvidence();
        await session?.destroy();
        proxy.stop(true);
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    }
}
