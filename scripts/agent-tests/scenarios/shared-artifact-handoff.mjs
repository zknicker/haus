import { agentMessages, deleteArtifacts, turnCommands } from '../artifact-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    optIn: true,
    contract:
        'An Agent pushes a workspace folder to Files and links it; a peer pulls the folder, edits one file, and pushes a revision while the untouched file stays put; the first Agent, editing its now-stale copy of the same file, pulls the peer revision, merges, and pushes without --replace so both edits survive.',
    name: 'shared-artifact-handoff',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [publisher, editor] = agents;
        const original = marker('ORIGINAL');
        const revised = marker('REVISED');
        const alpha = marker('ALPHA');
        const folder = `handoff/${kit.stamp.toLowerCase()}`;
        const local = `handoff-${kit.stamp.toLowerCase()}`;
        try {
            log('publisher pushes a folder');
            const publisherHead = await kit.readHead(publisher.dmChatId);
            await kit.harness.send(
                publisher.dmChatId,
                `In your workspace, create a folder ${local} with two files: notes.txt containing exactly "${original}" followed by a newline, and plan.md containing exactly "# Plan" followed by a newline. Share the folder in this Server's Files at ${folder} so the team can work on it, keep your local copy, and send me the link to notes.txt.`
            );
            const publishTurn = await settleTurn(publisher.id);
            expect(publishTurn.status, 'publish turn completed').toBe('completed');
            const shared = await files(kit, folder);
            expect(
                shared
                    .map((file) => file.path)
                    .sort()
                    .join(' '),
                'folder pushed with both files'
            ).toBe(`${folder}/notes.txt ${folder}/plan.md`);
            const notes = shared.find((file) => file.path.endsWith('notes.txt'));
            const plan = shared.find((file) => file.path.endsWith('plan.md'));
            expect(await bytes(kit, notes), 'original notes bytes').toBe(`${original}\n`);
            const announced = (
                await agentMessages(kit, publisher.id, publisher.dmChatId, publisherHead)
            )
                .map((message) => message.content)
                .join('\n');
            expect(announced, 'publisher linked notes.txt').toContain(notes.stable_url);

            log('editor pulls, edits one file, pushes');
            await kit.harness.send(
                editor.dmChatId,
                `The folder ${folder} in Files has our handoff notes. Work on it in your workspace: report the marker in notes.txt, change notes.txt to contain exactly "${revised}" followed by a newline, and push your change back to Files. Do not change plan.md.`
            );
            const editTurn = await settleTurn(editor.id);
            expect(editTurn.status, 'edit turn completed').toBe('completed');
            const editorCommands = artifactCommands(await turnCommands(kit, editor.id, editTurn));
            log(`editor artifact commands: ${editorCommands.join(' | ').slice(0, 600)}`);
            expect(/files pull\b/u.test(editorCommands.join('\n')), 'editor pulled').toBe(true);
            expect(/files push\b/u.test(editorCommands.join('\n')), 'editor pushed').toBe(true);
            await kit.awaitAgentReply(editor.dmChatId, editor.id, (message) =>
                message.content.includes(original)
            );
            const afterEdit = await current(kit, notes);
            expect(afterEdit.revision_number, 'notes gained revision 2').toBe(2);
            expect(await bytes(kit, afterEdit), 'revised notes bytes').toBe(`${revised}\n`);
            expect((await current(kit, plan)).revision_number, 'plan.md untouched').toBe(1);

            log('publisher edits its stale copy and must merge');
            await kit.harness.send(
                publisher.dmChatId,
                `In your local ${local} folder, add a new last line to notes.txt containing exactly "${alpha}", then push the change to Files.`
            );
            const mergeTurn = await settleTurn(publisher.id);
            expect(mergeTurn.status, 'merge turn completed').toBe('completed');
            const mergeCommands = artifactCommands(
                await turnCommands(kit, publisher.id, mergeTurn)
            );
            log(`publisher artifact commands: ${mergeCommands.join(' | ').slice(0, 600)}`);
            // Pulling before the first push (staging the merge up front) is as good as pulling
            // after the conflict; what matters is fetching the peer's revision, not overwriting it.
            expect(
                mergeCommands.some((command) => /files pull\b/u.test(command)),
                'pulled the current version to merge'
            ).toBe(true);
            expect(
                mergeCommands.some((command) => /--replace\b/u.test(command)),
                'did not overwrite with --replace'
            ).toBe(false);
            const merged = await current(kit, notes);
            expect(merged.revision_number, 'notes gained revision 3').toBe(3);
            const mergedText = await bytes(kit, merged);
            expect(mergedText, 'peer edit survived the merge').toContain(revised);
            expect(mergedText, 'own edit landed').toContain(alpha);
        } finally {
            await deleteArtifacts(kit, await files(kit, folder).catch(() => []));
        }
    },
});

function artifactCommands(commands) {
    return commands.filter((command) => command.includes('haus files'));
}

async function files(kit, prefix) {
    const listed = await kit.trpc('artifact.list', {
        serverId: kit.serverId,
        prefix,
        recursive: true,
        order: 'path',
        limit: 200,
    });
    return listed.artifacts;
}

async function current(kit, artifact) {
    const result = await kit.trpc('artifact.get', {
        serverId: kit.serverId,
        artifact_id: artifact.artifact_id,
    });
    return result.artifact;
}

async function bytes(kit, artifact) {
    const download = await kit.trpc('artifact.download', {
        serverId: kit.serverId,
        artifact_id: artifact.artifact_id,
        revision_id: artifact.revision_id,
    });
    const response = await fetch(download.download_url);
    if (!response.ok) {
        throw new Error(`Shared file download failed: ${response.status}`);
    }
    return response.text();
}
