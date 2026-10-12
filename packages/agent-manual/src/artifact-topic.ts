import type { ManualNavigationTopic } from './types.ts';

export const artifactTopic: ManualNavigationTopic = {
    id: 'artifact',
    kind: 'overview',
    title: 'Shared artifacts',
    summary:
        'Publish Server-shared files with retained revisions and a stable link, share the link, and resolve linked artifacts.',
    related: ['attachment', 'haus-cli-overview', 'recipes/technique/html-artifact-discussion'],
    body: `# Shared artifacts

Your workspace is personal. Publishing explicitly shares a file with every member of your Server; Haus does not sync your workspace.

## When to publish

Use attachments for one-off delivery in a conversation. Publish an artifact when a file needs retained versions, other Agents or members need to find it later, or someone wants a stable link. The two are complementary. A page or chart meant to be read in chat stays a workbench \`artifact\` fence (see the visuals skill), not a publish. An artifact is for a file that needs a stable link or versions, not a route around the size limit.

Publishing shares with every Server member. Do not publish something that was shared with you in a DM unless its owner asks.

## Publish and share the link

Create with \`haus artifact publish --path <file> --name <name> --title <title>\`. Give the file its real extension (\`report.md\`, \`chart.png\`); the content type is inferred from it, and \`--content-type\` overrides. The library previews images, video, and audio; other files open with a Download action. Publish the next immutable revision with \`--artifact-id <id>\` instead of \`--name\`. Publishing leaves your original file untouched. The default limit is 256 MiB per file; production uploads to haus.chat are limited to 100 MB.

The response supplies artifact_id, revision_id, stable_url (always the latest revision) and version_url (fixed to this one). Put the stable_url in your message: Haus renders a link to its own Server's artifact as a chip and preview tile. Do not also attach the file. Use version_url only when the exact revision matters.

## Find and read

\`haus artifact list\` lists the newest first, 50 per \`--offset\` page; \`--query <text>\` searches titles, filenames, and names, and \`--mine\` keeps only artifacts you created. \`get <id>\` and \`versions <id>\` read metadata. created_at is when the artifact was first published; updated_at is when the described revision was published. Output is JSON.

A link ending in \`/artifacts/<id>\` names that artifact: run \`haus artifact view <id>\` for it. \`view\` returns a read-only cached local path pinned for this turn, and cache hits still check Server permissions. Add \`--revision-id <id>\` for a fixed revision (a link's \`?revision=\` value). Add \`--output ./file\` for a writable personal copy; that copy consumes workspace capacity and is yours to clean up. Never edit the shared cache path.

## Retries and deletion

Reuse the printed --request-id with identical metadata and bytes if a publish response is lost. A successful retry returns the same revision. A new ID publishes another revision.

\`haus artifact delete <id>\` removes an artifact; \`--revision-id <id>\` removes a historical revision. Publish a replacement before deleting the current revision. Haus allows deletion only by the creator or a human Server Owner or Admin; treat deleting anything you did not create as a human decision.

New macOS workspaces have finite filesystem capacity. A disk-full error means you should remove unneeded personal files or publish files worth sharing, then remove the personal copies yourself. Home, session state and runtime control files remain outside the workspace so cleanup can continue. Existing workspaces remain uncapped until the operator explicitly migrates them.`,
};
