import { createHash } from 'node:crypto';
import { sleep } from '../eval-harness.mjs';
import { authoredInChannel } from './channel-messages.mjs';
import { waitForAgentReady } from './memory-feedback.mjs';

const pushDeadlineMs = 60_000;

export const ruleFileCases = Object.freeze({
    agent: {
        file: 'AGENTS.md',
        message: 'from now on, keep replies under three sentences.',
        pattern: /\b(three|3)\b.*\bsentences?\b/iu,
    },
    fact: {
        file: 'MEMORY.md',
        message: 'my timezone is Pacific.',
        pattern: /\bpacific\b/iu,
    },
    worker: {
        file: 'WORKER.md',
        message: 'from now on, every Worker attaches before/after screenshots.',
        pattern: /screenshot/iu,
    },
});

const ruleFiles = ['AGENTS.md', 'WORKER.md'];

export async function runRuleFile(variant, { agents, expect, kit, log, settleTurn }) {
    const [agent] = agents;
    const { file, message, pattern } = ruleFileCases[variant];
    await kit.harness.waitForAgentQuiet(agent.id, 10_000, 300_000);
    const memoryBefore = await readMemory(kit, agent);

    const channel = await kit.createChannel({ agentIds: [agent.id] });
    log(`sending the ${variant} message`);
    await kit.harness.send(channel.id, `@${agent.handle} ${message}`);
    const turn = await settleTurn(agent.id);
    expect(turn.status, 'turn completed').toBe('completed');
    await kit.harness.waitForAgentQuiet(agent.id, 10_000, 300_000);

    const memoryAfter = await readMemory(kit, agent);
    const memoryPushed = (rows) =>
        rows.some(
            (row) =>
                row.path === drivePath(agent, 'MEMORY.md') && row.sha256 === sha256(memoryAfter)
        );
    const drive = await awaitDrive(kit, agent, (rows) =>
        variant === 'fact'
            ? memoryPushed(rows)
            : rows.some((row) => row.path === drivePath(agent, file))
    );
    log(`Drive: ${[...drive.keys()].join(', ') || 'nothing'}`);

    log('checking gates');
    if (variant === 'fact') {
        expect(pattern.test(memoryAfter), 'MEMORY.md records the fact').toBe(true);
        expect(memoryPushed([...drive.values()]), 'MEMORY.md with the fact reached Drive').toBe(
            true
        );
        for (const ruleFile of ruleFiles) {
            expect(drive.has(drivePath(agent, ruleFile)), `no ${ruleFile} for a fact`).toBe(false);
        }
        return;
    }
    const saved = await readDriveFile(kit, drive.get(drivePath(agent, file)));
    expect(saved?.text ?? '', `${file} in Drive`).toBeTruthy();
    expect(pattern.test(saved.text), `${file} holds the rule`).toBe(true);
    expect(saved.author.type, `${file} revision author kind`).toBe('agent');
    expect(saved.author.agent_id, `${file} revision written by the Agent`).toBe(agent.id);
    for (const other of ruleFiles.filter((name) => name !== file)) {
        expect(drive.has(drivePath(agent, other)), `no ${other} for this rule`).toBe(false);
    }
    expect(pattern.test(memoryAfter), 'MEMORY.md does not hold the rule').toBe(false);
    if (variant === 'worker') {
        expect(memoryAfter, 'MEMORY.md unchanged').toBe(memoryBefore);
    }
    if (variant === 'agent') {
        await expectRuleSurvivesReset({ agent, expect, kit, log, settleTurn });
    }
}

const probeQuestion =
    'How does DNS resolution work, from typing a URL into the browser to getting an IP address?';

async function expectRuleSurvivesReset({ agent, expect, kit, log, settleTurn }) {
    log('resetting the session');
    await kit.trpc('agent.reset', { agentId: agent.id, kind: 'session', serverId: kit.serverId });
    await waitForAgentReady(kit, agent.id);
    const probe = await kit.createChannel({ agentIds: [agent.id] });
    const head = await kit.readHead(probe.id);
    await kit.harness.send(probe.id, `@${agent.handle} ${probeQuestion}`);
    const turn = await settleTurn(agent.id);
    expect(turn.status, 'probe turn completed').toBe('completed');
    const replies = await authoredInChannel(kit, probe.id, agent.id, head);
    const sentences = replies.flatMap(sentencesOf);
    log(`probe reply: ${sentences.length} sentence(s)`);
    expect(replies.length > 0, 'probe answered after the session reset').toBe(true);
    expect(sentences.length <= 3, 'probe reply keeps to three sentences').toBe(true);
}

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

export function sentencesOf(text) {
    return text
        .replace(/\[([^\]]*)\]\([^)]*\)/gu, ' $1 ')
        .split(/\n+/u)
        .map((line) => line.replace(/^[\s*>#-]+/u, ''))
        .flatMap((line) =>
            [...sentenceSegmenter.segment(line)].map(({ segment }) => segment.trim())
        )
        .filter((part) => /\p{L}/u.test(part));
}

function drivePath({ handle }, file) {
    return `agents/${handle}/${file}`;
}

async function readMemory(kit, agent) {
    const file = await kit.trpc('agent.workspaceFile', {
        agentId: agent.id,
        path: `drive/${drivePath(agent, 'MEMORY.md')}`,
        serverId: kit.serverId,
    });
    return file.content;
}

async function awaitDrive(kit, agent, settled) {
    const deadline = Date.now() + pushDeadlineMs;
    let rows = await listArea(kit, agent);
    while (!settled(rows) && Date.now() < deadline) {
        await sleep(1000);
        rows = await listArea(kit, agent);
    }
    return new Map(rows.map((row) => [row.path, row]));
}

async function listArea(kit, { handle }) {
    const result = await kit.trpc('artifact.list', {
        limit: 200,
        order: 'path',
        prefix: `agents/${handle}`,
        recursive: true,
        serverId: kit.serverId,
    });
    return result.artifacts;
}

async function readDriveFile(kit, row) {
    if (!row) {
        return null;
    }
    const target = {
        artifact_id: row.artifact_id,
        revision_id: row.revision_id,
        serverId: kit.serverId,
    };
    const [{ artifact }, content] = await Promise.all([
        kit.trpc('artifact.get', target),
        kit.trpc('artifact.text', target),
    ]);
    return {
        author: artifact.author,
        text: content.status === 'text' ? content.text : '',
    };
}

function sha256(content) {
    return createHash('sha256').update(content).digest('hex');
}
