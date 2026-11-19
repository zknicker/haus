import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computerAttachmentPath } from '../author.mjs';
import { authoredInChannel } from '../channel-messages.mjs';
import { marker } from '../kit.mjs';
import { defineScenario } from '../scenario.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A pre-Drive workspace (MEMORY.md and notes/ at the workspace root, nothing in Drive) moves into Drive at agents/<handle>/ on the next turn: MEMORY.md is byte-identical in the drive/ folder and on the Server, the legacy copies are gone, and the turn answers from the moved memory.',
    name: 'drive-migration-memory',
    optIn: true,
    async run({ agents, expect, kit, log, settleTurn }) {
        const [worker] = agents;
        await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);
        const agentRoot = path.join(
            path.dirname(computerAttachmentPath({ repositoryRoot, serverId: kit.serverId })),
            'agents',
            worker.id
        );
        const workspace = path.join(agentRoot, 'workspace');
        const folder = path.join(workspace, 'drive', 'agents', worker.handle);
        const codeword = marker('LANTERN');
        const memory = renderMemory(worker.handle, codeword);
        const note = `The codeword ${codeword} came from the Drive migration rehearsal.\n`;

        log('rebuilding the pre-Drive workspace');
        await removeDriveMemory(kit, worker.handle, agentRoot, folder);
        await mkdir(path.join(workspace, 'notes'), { recursive: true });
        await writeFile(path.join(workspace, 'MEMORY.md'), memory);
        await writeFile(path.join(workspace, 'notes', 'codeword.md'), note);
        const before = sha256(memory);
        log(`MEMORY.md before ${before}`);

        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const head = await kit.readHead(channel.id);
        await kit.harness.send(
            channel.id,
            `@${worker.handle} What is the project codeword? Reply with just the codeword.`
        );
        const turn = await settleTurn(worker.id);
        const replies = await authoredInChannel(kit, channel.id, worker.id, head);
        const drive = await driveDigests(kit, worker.handle);
        const after = sha256(await readFile(path.join(folder, 'MEMORY.md')));
        log(`MEMORY.md after ${after}, Drive ${drive.get(`agents/${worker.handle}/MEMORY.md`)}`);

        log('checking gates');
        expect(turn.status, 'turn status').toBe('completed');
        expect(await exists(path.join(workspace, 'MEMORY.md')), 'legacy MEMORY.md removed').toBe(
            false
        );
        expect(await exists(path.join(workspace, 'notes')), 'legacy notes/ removed').toBe(false);
        expect(after, 'drive/ folder MEMORY.md digest').toBe(before);
        expect(drive.get(`agents/${worker.handle}/MEMORY.md`), 'Drive MEMORY.md digest').toBe(
            before
        );
        expect(drive.get(`agents/${worker.handle}/notes/codeword.md`), 'Drive note digest').toBe(
            sha256(note)
        );
        expect(replies.join('\n'), 'answers from the moved memory').toContain(codeword);
    },
});

function renderMemory(handle, codeword) {
    return `# ${handle}

## Role

Temporary agent-test fixture. Act only when explicitly addressed or assigned.

## Standing Preferences

- The project codeword is ${codeword}. Give it when someone asks for the codeword.

## Key Knowledge

- notes/codeword.md: where the codeword came from
`;
}

async function removeDriveMemory(kit, handle, agentRoot, folder) {
    const stale = (await listDrive(kit, handle)).filter(
        (artifact) =>
            artifact.path === `agents/${handle}/MEMORY.md` ||
            artifact.path.startsWith(`agents/${handle}/notes/`)
    );
    if (stale.length > 0) {
        await kit.trpc('artifact.deleteMany', {
            artifact_ids: stale.map((artifact) => artifact.artifact_id),
            serverId: kit.serverId,
        });
    }
    await rm(path.join(folder, 'MEMORY.md'), { force: true });
    await rm(path.join(folder, 'notes'), { force: true, recursive: true });
    await rm(path.join(agentRoot, 'runtime', 'drive-seed.json'), { force: true });
}

async function driveDigests(kit, handle) {
    return new Map(
        (await listDrive(kit, handle)).map((artifact) => [artifact.path, artifact.sha256])
    );
}

async function listDrive(kit, handle) {
    const result = await kit.trpc('artifact.list', {
        limit: 200,
        order: 'path',
        prefix: `agents/${handle}`,
        recursive: true,
        serverId: kit.serverId,
    });
    return result.artifacts;
}

async function exists(file) {
    return await stat(file).then(
        () => true,
        () => false
    );
}

function sha256(content) {
    return createHash('sha256').update(content).digest('hex');
}
