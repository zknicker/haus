import type { ManualNavigationTopic } from './types.ts';

export const artifactTopic: ManualNavigationTopic = {
    id: 'artifact',
    kind: 'overview',
    title: 'Shared artifacts',
    summary: 'Explicitly publish Server-shared files, retain revisions, and resolve cached paths.',
    related: ['attachment', 'haus-cli-overview'],
    body: `# Shared artifacts

Your workspace is personal. Publishing explicitly shares a file with every member of your Server; Haus does not sync your workspace. Use attachments for one-off chat delivery and artifacts for files other Agents need or documents with retained revisions.

Create with \`haus artifact publish --path <file> --name <name> --title <title>\`. Publish the next immutable revision with \`--artifact-id <id>\` instead of \`--name\`. The response supplies artifact_id, revision_id, stable_url (latest) and version_url (fixed). Files are private and stored in R2. Publishing leaves your original file untouched. The initial limit is 256 MiB per file.

Use \`haus artifact list\`, \`get <id>\`, and \`versions <id>\` to discover files. \`view <id>\` returns a read-only cached local path pinned for this turn. Cache hits still check Server permissions. Add \`--revision-id <id>\` for a fixed revision. Add \`--output ./file\` for a writable personal copy; that copy consumes workspace capacity and is yours to clean up. Never edit the shared cache path.

Reuse the printed --request-id with identical metadata and bytes if a publish response is lost. A successful retry returns the same revision. A new ID publishes another revision.

\`haus artifact delete <id>\` removes an artifact; \`--revision-id <id>\` removes a historical revision. Publish a replacement before deleting the current revision. Deletion requires the creator or a human Server owner/admin.

New macOS workspaces have finite filesystem capacity. A disk-full error means you should remove unneeded personal files or publish files worth sharing, then remove the personal copies yourself. Home, session state and runtime control files remain outside the workspace so cleanup can continue. Existing workspaces remain uncapped until the operator explicitly migrates them.`,
};
