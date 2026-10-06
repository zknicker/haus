// EXPERIMENT bench: resume-old-session vs wake-recycle (fresh session + MEMORY.md head + briefing)
// for an Agent woken after an idle gap longer than the provider prompt-cache TTL.
//
// The Computer must run with HAUS_WAKE_RECYCLE=1 for the whole run. Arms are per Agent: the
// resume arm gets a `wake-recycle-off` marker in its Computer-local Agent root, so both arms run
// the same build. Phases run as separate invocations and share <out>/state.json.
//
//   agent-varlock -- bun scripts/wake-recycle-bench.mjs <phase> --out DIR [options]
//   phases: provision --arm resume|recycle --count N [--runtime codex] [--model-hint sol]
//           build [--target-tokens 160000] [--concurrency 4]
//           wake [--stagger-s 20]
//           ttl-probe --gap-min M [--agent ID]
//           report [--weights read=0.1,write=1.25]
//   common: --server URL (default: dev ports from HAUS_DEV_STACK_ID / checkout)
//           --stack-id ID (default $HAUS_DEV_STACK_ID) --data-root DIR --stack-log FILE
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { agentHandleSuffix, isReady, pickAgentTarget } from './agent-tests/provisioner.mjs';
import { createEvalHarness, sleep } from './eval-harness.mjs';

const phase = process.argv[2];
const out = flag('--out');
if (!(phase && out)) {
    fail('usage: bun scripts/wake-recycle-bench.mjs <phase> --out DIR [...]');
}
mkdirSync(out, { recursive: true });
const statePath = join(out, 'state.json');
const state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8'))
    : { agents: [], createdAt: new Date().toISOString(), probes: [], windows: [] };
const stackId = flag('--stack-id') ?? process.env.HAUS_DEV_STACK_ID ?? state.stackId ?? null;
state.stackId = stackId;
state.stackLog = flag('--stack-log') ?? state.stackLog ?? null;
const dataRoot =
    flag('--data-root') ??
    process.env.HAUS_COMPUTER_DATA_ROOT ??
    state.dataRoot ??
    (stackId ? join(homedir(), '.haus', 'dev', stackId, 'computer') : null);
state.dataRoot = dataRoot;

const wakeText = 'picking this back up — where were we, and do the next step';
const followUps = [
    'quick check before you go further: what port and retry limit did we settle on, and why did we drop SQLite?',
    'thanks — add a short "Decisions" section to the README with those choices. Reply with one line when done.',
];

const phases = { build, provision, report, 'ttl-probe': ttlProbe, wake };
if (!phases[phase]) {
    fail(`unknown phase ${phase}`);
}
const needsHarness = phase !== 'report';
const harness = needsHarness ? await createEvalHarness({ evalName: 'wakebench' }) : null;
if (harness) {
    state.serverId = harness.serverId;
}
const phaseWindow = { phase, startedAt: new Date().toISOString(), stackLogStart: stackLogSize() };
try {
    await phases[phase]();
} finally {
    if (phase !== 'report') {
        state.windows.push({
            ...phaseWindow,
            endedAt: new Date().toISOString(),
            stackLogEnd: stackLogSize(),
        });
    }
    save();
    await harness?.cleanup();
    setTimeout(() => process.exit(process.exitCode ?? 0), 0);
}

// ---------------------------------------------------------------- provision

async function provision() {
    const arm = flag('--arm');
    const count = Number(flag('--count') ?? '1');
    if (!['resume', 'recycle'].includes(arm)) {
        fail('--arm resume|recycle');
    }
    const computers = await harness.trpc('computer.list', { serverId: harness.serverId });
    const target = pickAgentTarget(computers, {
        modelHint: flag('--model-hint') ?? 'sol',
        runtimeId: flag('--runtime') ?? 'codex',
    });
    if (!target) {
        fail('no attached Computer reports that runtime/model');
    }
    for (let index = 0; index < count; index += 1) {
        const handle = `wrb-${arm}-${agentHandleSuffix()}`;
        const created = await harness.trpc('agent.create', {
            computerId: target.computerId,
            description: 'Temporary wake-recycle bench Agent. Work with the owner in DM.',
            displayName: `Bench ${arm} ${state.agents.length + 1}`,
            handle,
            modelId: target.modelId,
            runtimeId: target.runtimeId,
            serverId: harness.serverId,
        });
        const agentId = created.agent.id;
        const dm = await harness.trpc('chat.ensureAgentDm', {
            agentId,
            serverId: harness.serverId,
        });
        const record = {
            arm,
            code: `A${String(state.agents.length + 1).padStart(2, '0')}`,
            dmChatId: dm.id,
            handle,
            id: agentId,
            modelId: target.modelId,
            runtimeId: target.runtimeId,
        };
        state.agents.push(record);
        save();
        await waitReady(agentId);
        if (arm === 'resume') {
            await writeOptOut(agentId);
        }
        log(
            `provisioned ${record.code} @${handle} ${agentId} arm=${arm} ${target.runtimeId}/${target.modelId}`
        );
    }
}

// ---------------------------------------------------------------- build

async function build() {
    const targetTokens = Number(flag('--target-tokens') ?? '160000');
    const pending = state.agents.filter((agent) => !agent.build?.done);
    await mapLimit(pending, Number(flag('--concurrency') ?? '4'), (agent) =>
        buildAgent(agent, targetTokens)
    );
}

async function buildAgent(agent, targetTokens) {
    agent.build ??= { facts: makeFacts(), steps: 0 };
    const facts = agent.build.facts;
    writeReferenceCorpus(agent.id, facts);
    const script = buildScript(facts);
    for (let step = agent.build.steps; step < script.length; step += 1) {
        await converse(agent, script[step]);
        agent.build.steps = step + 1;
        save();
    }
    let part = agent.build.readParts ?? 0;
    while ((sessionFacts(agent.id)?.lastContextTokens ?? 0) < targetTokens && part < 30) {
        part += 1;
        writeReferencePart(agent.id, facts, part);
        await converse(
            agent,
            `Read reference/spec-part-${part}.md in full (all of it, page through if output is truncated) and tell me in two sentences whether anything in it changes our plan for ${facts.project}.`
        );
        agent.build.readParts = part;
        save();
        log(`${agent.code} context=${sessionFacts(agent.id)?.lastContextTokens ?? '?'}`);
    }
    await converse(agent, closingStep(facts));
    agent.build.done = true;
    agent.build.finalContextTokens = sessionFacts(agent.id)?.lastContextTokens ?? null;
    agent.build.finishedAt = new Date().toISOString();
    agent.build.lastTurns = turnRows(agent.id).slice(-1);
    save();
    log(`${agent.code} build done context=${agent.build.finalContextTokens}`);
}

function makeFacts() {
    const pick = (values) => values[Math.floor(Math.random() * values.length)];
    return {
        command: pick(['prune', 'export', 'rollup', 'verify']),
        configName: pick(['ledger.toml', 'tallyrc.toml', 'keel.toml', 'brine.toml']),
        library: pick(['click', 'typer', 'argparse']),
        port: 7000 + Math.floor(Math.random() * 900),
        project: pick(['tidewatch', 'saltmarsh', 'loftcount', 'emberlog', 'quillstack']),
        rejectedReason: pick([
            'the deploy target has a read-only filesystem except /tmp',
            'we need the cache to be diffable in code review',
            'two processes write concurrently and we hit lock contention in the spike',
        ]),
        retryLimit: 3 + Math.floor(Math.random() * 6),
    };
}

function buildScript(f) {
    return [
        `New mini project for us: a small Python CLI called \`${f.project}\` that ingests sensor CSV logs and reports anomalies. Create \`${f.project}/\` in your workspace with a README stub and a \`src/\` folder. We'll make decisions here in chat as we go.`,
        `Decision: use \`${f.library}\` for the CLI. The local dashboard server will listen on port ${f.port}. Uploads retry at most ${f.retryLimit} times with exponential backoff. Scaffold \`src/cli.py\` with an \`ingest\` subcommand stub that reflects those choices.`,
        `We looked at SQLite for the anomaly cache but rejected it because ${f.rejectedReason}. Use flat JSON files under \`.cache/\` instead. Implement \`src/cache.py\` with load/save helpers accordingly.`,
        `Config lives in \`${f.configName}\` at the project root. Write \`src/config.py\` that loads it with sensible defaults (port, retry limit) and a tiny sample \`${f.configName}\`.`,
    ];
}

function closingStep(f) {
    return `Good progress. Open TODO for next time: implement the \`${f.command}\` subcommand in \`src/cli.py\` (it should operate on the JSON cache). Don't start it now — just confirm you've got it and stop there.`;
}

// ---------------------------------------------------------------- wake

async function wake() {
    const stagger = Number(flag('--stagger-s') ?? '20') * 1000;
    const agents = state.agents.filter((agent) => agent.build?.done && !agent.wake);
    await Promise.all(
        agents.map(async (agent, index) => {
            await sleep(index * stagger);
            const before = sessionFacts(agent.id);
            const lastEnded = turnRows(agent.id).at(-1)?.endedAt ?? null;
            const record = {
                idleMsAtSend: lastEnded ? Date.now() - Date.parse(lastEnded) : null,
                priorContextTokens: before?.lastContextTokens ?? null,
                turns: [],
            };
            for (const [kind, text] of [
                ['wake', wakeText],
                ['follow1', followUps[0]],
                ['follow2', followUps[1]],
            ]) {
                record.turns.push({ kind, ...(await exchange(agent, text)) });
            }
            agent.wake = record;
            save();
            log(`${agent.code} wake done`);
        })
    );
}

/** Sends one message and measures the turn(s) it caused. */
async function exchange(agent, text) {
    const head = await harness.readHead(agent.dmChatId);
    const sent = await harness.send(agent.dmChatId, text);
    const own = (await harness.readMessages(agent.dmChatId)).find(
        (message) =>
            message.sequence > head && message.author.kind !== 'agent' && message.content === text
    );
    const sentAt =
        own?.createdAt ?? sent?.createdAt ?? sent?.message?.createdAt ?? new Date().toISOString();
    const sendClock = Date.now();
    let firstReply = null;
    const deadline = Date.now() + 20 * 60_000;
    while (!firstReply && Date.now() < deadline) {
        const messages = await harness.readMessages(agent.dmChatId);
        firstReply = messages.find(
            (message) =>
                message.sequence > head &&
                message.author.kind === 'agent' &&
                message.author.agentId === agent.id
        );
        if (!firstReply) {
            await sleep(1000);
        }
    }
    const firstReplyObservedMs = Date.now() - sendClock;
    await harness.waitForAgentQuiet(agent.id, 8000, 20 * 60_000);
    const messages = await harness.readMessages(agent.dmChatId);
    const replies = messages.filter(
        (message) =>
            message.sequence > head &&
            message.author.kind === 'agent' &&
            message.author.agentId === agent.id
    );
    const turns = turnRows(agent.id).filter((row) => row.startedAt >= sentAt.slice(0, 19));
    return {
        firstReplyMs: firstReply ? Date.parse(firstReply.createdAt) - Date.parse(sentAt) : null,
        firstReplyObservedMs: firstReply ? firstReplyObservedMs : null,
        recycleLog: turns.map((turn) => recycleDecision(agent.id, turn.runId)),
        replies: replies.map((message) => message.content),
        sentAt,
        text,
        turns,
    };
}

// ---------------------------------------------------------------- ttl probe

async function ttlProbe() {
    const gapMs = Number(flag('--gap-min')) * 60_000;
    if (!(gapMs > 0)) {
        fail('--gap-min M');
    }
    const agent =
        state.agents.find((candidate) => candidate.id === flag('--agent')) ??
        state.agents.find((candidate) => candidate.arm === 'resume' && candidate.build?.done) ??
        state.agents.find((candidate) => candidate.arm === 'resume');
    if (!agent) {
        fail('no resume-arm agent to probe (provision one; probes must never recycle)');
    }
    await writeOptOut(agent.id);
    const lastEnded = turnRows(agent.id).at(-1)?.endedAt;
    const waitMs = lastEnded ? Date.parse(lastEnded) + gapMs - Date.now() : 0;
    if (waitMs > 0) {
        log(`waiting ${Math.round(waitMs / 60_000)} min for the gap`);
        await sleep(waitMs);
    }
    const n = state.probes.length + 1;
    const result = await exchange(agent, `ping ${n}: reply with just "pong ${n}"`);
    const gapActualMs = lastEnded ? Date.parse(result.sentAt) - Date.parse(lastEnded) : null;
    state.probes.push({ agentId: agent.id, gapActualMs, gapMin: gapMs / 60_000, ...result });
    const turn = result.turns[0];
    log(
        `probe gap=${Math.round((gapActualMs ?? 0) / 60_000)}m input=${turn?.inputTokens} cacheRead=${turn?.cacheReadTokens} cacheWrite=${turn?.cacheWriteTokens}`
    );
}

// ---------------------------------------------------------------- report

async function report() {
    const weights = parseWeights(flag('--weights') ?? 'read=0.1,write=1.25');
    const rows = state.agents
        .filter((agent) => agent.wake)
        .map((agent) => {
            const [wakeTurn, f1, f2] = agent.wake.turns;
            const sum = (exchangeRecord, key) =>
                exchangeRecord.turns.reduce((total, turn) => total + (turn[key] ?? 0), 0);
            const turnSeconds = (exchangeRecord) =>
                exchangeRecord.turns.reduce(
                    (total, turn) =>
                        total + (Date.parse(turn.endedAt) - Date.parse(turn.startedAt)) / 1000,
                    0
                );
            const weighted = (exchangeRecord) =>
                sum(exchangeRecord, 'inputTokens') -
                sum(exchangeRecord, 'cacheReadTokens') * (1 - weights.read) +
                sum(exchangeRecord, 'cacheWriteTokens') * (weights.write - 1);
            return {
                arm: agent.arm,
                code: agent.code,
                f1Input: sum(f1, 'inputTokens'),
                f2Input: sum(f2, 'inputTokens'),
                firstReplyS: wakeTurn.firstReplyMs === null ? null : wakeTurn.firstReplyMs / 1000,
                followWeighted: weighted(f1) + weighted(f2),
                idleMin: agent.wake.idleMsAtSend / 60_000,
                priorContext: agent.wake.priorContextTokens,
                recycled: wakeTurn.recycleLog.some((line) => line?.includes('decision=recycle')),
                wakeCacheRead: sum(wakeTurn, 'cacheReadTokens'),
                wakeCacheWrite: sum(wakeTurn, 'cacheWriteTokens'),
                wakeInput: sum(wakeTurn, 'inputTokens'),
                wakeOutput: sum(wakeTurn, 'outputTokens'),
                wakeTurnS: turnSeconds(wakeTurn),
                wakeWeighted: weighted(wakeTurn),
            };
        });
    const metrics = Object.keys(rows[0] ?? {}).filter(
        (key) => !['arm', 'code', 'recycled'].includes(key)
    );
    const lines = [
        '# Wake recycle bench',
        '',
        `Generated ${new Date().toISOString()}; weights cacheRead=${weights.read} cacheWrite=${weights.write} (weighted = input - read*(1-r) + write*(w-1); input assumed to include cached tokens).`,
        '',
    ];
    for (const arm of ['resume', 'recycle']) {
        const armRows = rows.filter((row) => row.arm === arm);
        lines.push(
            `## ${arm} (n=${armRows.length}; recycled turns ${armRows.filter((row) => row.recycled).length})`,
            '',
            '| metric | p25 | median | p75 |',
            '| --- | --- | --- | --- |',
            ...metrics.map((metric) => {
                const values = armRows.map((row) => row[metric]).filter(Number.isFinite);
                return `| ${metric} | ${fmt(quantile(values, 0.25))} | ${fmt(quantile(values, 0.5))} | ${fmt(quantile(values, 0.75))} |`;
            }),
            ''
        );
    }
    lines.push('## Per agent', '', `| ${['code', 'arm', 'recycled', ...metrics].join(' | ')} |`);
    lines.push(`| ${['code', 'arm', 'recycled', ...metrics].map(() => '---').join(' | ')} |`);
    for (const row of rows) {
        lines.push(
            `| ${[row.code, row.arm, row.recycled, ...metrics.map((m) => fmt(row[m]))].join(' | ')} |`
        );
    }
    lines.push('', '## Contamination (stack log, per phase window)', '');
    for (const entry of state.windows) {
        const text = stackLogSlice(entry.stackLogStart, entry.stackLogEnd);
        lines.push(
            `- ${entry.phase} ${entry.startedAt} → ${entry.endedAt}: attachment-socket closes=${count(text, 'Server closed the attachment socket')}, stream stalls=${count(text, 'Harness turn stream stalled')}`
        );
    }
    if (state.probes.length > 0) {
        lines.push(
            '',
            '## TTL probes',
            '',
            '| gap min | input | cacheRead | cacheWrite |',
            '| --- | --- | --- | --- |'
        );
        for (const probe of state.probes) {
            const turn = probe.turns[0] ?? {};
            lines.push(
                `| ${fmt((probe.gapActualMs ?? 0) / 60_000)} | ${turn.inputTokens} | ${turn.cacheReadTokens} | ${turn.cacheWriteTokens} |`
            );
        }
    }
    writeFileSync(join(out, 'report.md'), `${lines.join('\n')}\n`);
    writeFileSync(join(out, 'rubric.md'), rubric());
    log(`wrote ${join(out, 'report.md')} and ${join(out, 'rubric.md')}`);
}

function rubric() {
    const sections = [
        '# Wake reply grading (blind: agents are coded; arm mapping is in state.json)',
        '',
        'Score each wake reply 0-2 per item: recalls project + file layout; recalls port, retry limit, library, config file name; recalls the rejected SQLite approach and its reason; identifies and starts the open TODO; no ritual opening (re-reading everything, announcing a fresh session) before acting; no redoing finished work.',
        '',
    ];
    for (const agent of state.agents.filter((candidate) => candidate.wake)) {
        const f = agent.build.facts;
        sections.push(
            `## ${agent.code}`,
            '',
            `Ground truth: project \`${f.project}\`, library ${f.library}, port ${f.port}, retry limit ${f.retryLimit}, config \`${f.configName}\`, rejected SQLite because ${f.rejectedReason}, open TODO: implement \`${f.command}\` subcommand.`,
            ''
        );
        for (const turn of agent.wake.turns) {
            sections.push(
                `### ${turn.kind}: "${turn.text}"`,
                '',
                ...turn.replies.map((reply) => `> ${reply.replace(/\n/gu, '\n> ')}\n`),
                ''
            );
        }
    }
    return `${sections.join('\n')}\n`;
}

// ---------------------------------------------------------------- shared helpers

async function converse(agent, text) {
    const result = await exchange(agent, text);
    if (result.replies.length === 0) {
        log(`${agent.code} warning: no reply to "${text.slice(0, 60)}"`);
    }
    return result;
}

async function waitReady(agentId) {
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
        const agents = await harness.trpc('agent.list', { serverId: harness.serverId });
        if (isReady(agents.find((candidate) => candidate.id === agentId))) {
            return;
        }
        await sleep(1000);
    }
    fail(`agent ${agentId} never became ready`);
}

function agentRoot(agentId) {
    if (!(dataRoot && state.serverId)) {
        fail('need --data-root (or --stack-id) and a Server');
    }
    return join(dataRoot, 'servers', state.serverId, 'agents', agentId);
}

async function writeOptOut(agentId) {
    const root = agentRoot(agentId);
    for (let attempt = 0; attempt < 60 && !existsSync(root); attempt += 1) {
        await sleep(1000);
    }
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'wake-recycle-off'), 'wake-recycle bench resume arm\n');
}

function sessionFacts(agentId) {
    try {
        return JSON.parse(readFileSync(join(agentRoot(agentId), 'session.json'), 'utf8'));
    } catch {
        return null;
    }
}

function writeReferenceCorpus(agentId, facts) {
    const dir = join(agentRoot(agentId), 'workspace', 'reference');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'README.md'),
        `Reference material for ${facts.project}: sensor fleet field notes, one part per file.\n`
    );
}

/** ~30 KB of plausible, non-repeating field notes (≈7.5k tokens). */
function writeReferencePart(agentId, facts, part) {
    const sensors = [
        'thermistor',
        'hygrometer',
        'anemometer',
        'barometer',
        'lux meter',
        'CO2 probe',
    ];
    const sites = [
        'north pier',
        'boathouse',
        'ridge mast',
        'pump station',
        'greenhouse 3',
        'quarry gate',
    ];
    const lines = [`# ${facts.project} field notes — part ${part}`, ''];
    let seed = part * 7919;
    const next = () => {
        seed = (seed * 48_271) % 2_147_483_647;
        return seed;
    };
    while (lines.join('\n').length < 30_000) {
        const sensor = sensors[next() % sensors.length];
        const site = sites[next() % sites.length];
        lines.push(
            `- ${2026 - (next() % 3)}-${String((next() % 12) + 1).padStart(2, '0')}-${String((next() % 28) + 1).padStart(2, '0')} ${site}: ${sensor} #${next() % 900} drifted ${(next() % 400) / 100} units over ${next() % 72}h; field tech ${['Ana', 'Bo', 'Cy', 'Dee', 'Eli'][next() % 5]} recalibrated against reference unit R${next() % 40}. Anomaly window ${next() % 30} min, reading ${(next() % 10_000) / 10}, baseline ${(next() % 10_000) / 10}. Note: ${['ignore during defrost cycles', 'flag if three consecutive windows exceed baseline', 'battery sag mimics drift below 3.1V', 'site loses power nightly 02:00-02:20', 'duplicate rows appear after modem reconnect'][next() % 5]}.`
        );
    }
    writeFileSync(
        join(agentRoot(agentId), 'workspace', 'reference', `spec-part-${part}.md`),
        `${lines.join('\n')}\n`
    );
}

function turnRows(agentId) {
    const port = postgresPort();
    const sql = `select run_id, to_char(started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), to_char(ended_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), status, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, runtime_id, model_id from agent_turns where agent_id = '${agentId.replace(/'/gu, '')}' order by started_at`;
    const raw = execFileSync(
        psqlBinary(),
        [
            '-h',
            '127.0.0.1',
            '-p',
            String(port),
            '-U',
            'haus',
            '-d',
            'haus',
            '-At',
            '-F',
            '\t',
            '-c',
            sql,
        ],
        { encoding: 'utf8' }
    );
    return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const [
                runId,
                startedAt,
                endedAt,
                status,
                input,
                read,
                write,
                output,
                runtimeId,
                modelId,
            ] = line.split('\t');
            return {
                cacheReadTokens: Number(read),
                cacheWriteTokens: Number(write),
                endedAt,
                inputTokens: Number(input),
                modelId,
                outputTokens: Number(output),
                runId,
                runtimeId,
                startedAt,
                status,
            };
        });
}

function postgresPort() {
    const explicit = flag('--pg-port');
    if (explicit) {
        return Number(explicit);
    }
    if (!stackId) {
        fail('need --stack-id or --pg-port to read agent_turns');
    }
    const pid = readFileSync(
        join(homedir(), '.haus', 'dev', stackId, 'postgres', 'postmaster.pid'),
        'utf8'
    );
    return Number(pid.split('\n')[3]);
}

function psqlBinary() {
    return (
        ['/opt/homebrew/opt/postgresql@16/bin/psql', '/opt/homebrew/opt/libpq/bin/psql'].find(
            existsSync
        ) ?? 'psql'
    );
}

function recycleDecision(agentId, runId) {
    const text = stackLogSlice(0, stackLogSize());
    return (
        text
            .split('\n')
            .find(
                (line) =>
                    line.includes('[WakeRecycle]') &&
                    line.includes(`agent=${agentId}`) &&
                    line.includes(`run=${runId}`)
            ) ?? null
    );
}

function stackLogSize() {
    return state.stackLog && existsSync(state.stackLog) ? statSync(state.stackLog).size : 0;
}

function stackLogSlice(start, end) {
    if (!(state.stackLog && existsSync(state.stackLog))) {
        return '';
    }
    return readFileSync(state.stackLog).subarray(start, end).toString('utf8');
}

async function mapLimit(items, limit, operation) {
    const queue = [...items];
    await Promise.all(
        Array.from({ length: Math.min(limit, queue.length) }, async () => {
            while (queue.length > 0) {
                await operation(queue.shift());
            }
        })
    );
}

function quantile(values, q) {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function parseWeights(raw) {
    const entries = Object.fromEntries(raw.split(',').map((pair) => pair.split('=')));
    return { read: Number(entries.read ?? 0.1), write: Number(entries.write ?? 1.25) };
}

function count(text, needle) {
    return text.split(needle).length - 1;
}

function fmt(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '–';
    }
    return typeof value === 'number'
        ? Number.isInteger(value)
            ? String(value)
            : value.toFixed(1)
        : String(value);
}

function save() {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function flag(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function log(message) {
    process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}
