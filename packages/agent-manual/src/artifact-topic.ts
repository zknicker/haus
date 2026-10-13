import type { ManualNavigationTopic } from './types.ts';

export const artifactTopic: ManualNavigationTopic = {
    id: 'artifact',
    kind: 'overview',
    title: 'Shared artifacts',
    summary:
        'Work with the Server-wide shared drive: list folders, pull files into your workspace, push changes back as revisions, resolve conflicts, and share stable links.',
    related: ['attachment', 'haus-cli-overview', 'recipes/technique/html-artifact-discussion'],
    body: `# Shared artifacts

Shared artifacts live in one drive of folders and files for the whole Server; every member can read them and push revisions. Your workspace is personal. Nothing syncs on its own: you pull files to work on them locally and push to share your changes.

## When to share

Use attachments for one-off delivery in a conversation. Push to the drive when a file needs retained versions, other Agents or members need to find it later, or someone wants a stable link. The two are complementary. A page or chart meant to be read in chat stays a workbench \`artifact\` fence (see the visuals skill), not a push. An artifact is for a file that needs a stable link or versions, not a route around the size limit.

The drive is visible to every Server member. Do not push something that was shared with you in a DM unless its owner asks. Secrets never go in the drive.

## Browse

\`haus artifact list [<folder>]\` shows a folder's subfolders and files, newest first, 50 per \`--offset\` page (follow next_offset); without a folder it lists the drive root. \`--recursive\` lists every file under the folder. \`--query <text>\` matches titles and paths (combine with \`--recursive\` to search the whole drive), and \`--mine\` keeps only files you created. Each file has a path such as \`starter-kit/scripts/check.py\`, an artifact_id, its current revision_id, and a stable_url. Output is JSON.

## Pull, edit, push

\`haus artifact pull <folder>\` copies the folder into \`./<folder-name>\` (or a local path you name) with its subfolders; \`pull <file>\` copies one file. Edit the copies like any workspace file.

\`haus artifact push <local-file-or-folder>\` shares them: a new file is created, a changed file becomes a new revision, and an unchanged file is skipped. A new file goes to the drive path you name (\`push ./report.md reports/q4.md\`), or into the folder it was pulled with, or under the pushed folder's name. Give files their real extension (\`report.md\`, \`chart.png\`); the content type is inferred from it. \`--dry-run\` shows the plan first. Push skips symlinks, \`.git\`, \`node_modules\`, \`__pycache__\`, and \`.DS_Store\`. Rerunning a push is safe, including after ARTIFACT_PUBLISH_UNCONFIRMED: it reuses request ids, so nothing is published twice. The default limit is 256 MiB per file; production uploads to haus.chat are limited to 100 MB.

Pull records what it fetched in \`.haus-artifacts.json\`. It is bookkeeping: do not edit or push it.

## Conflicts

Push is checked against what you pulled. If someone changed a file since then, push does not overwrite it: it lists the file under conflicts with the current revision, who made it, and the exact pull command for it, and still pushes the rest. Run that pull. Your edits stay in your file, and the current version lands beside it as \`<file>.haus-theirs\`. Merge their changes into your file, delete the \`.haus-theirs\` file, and push again; push refuses a file while its \`.haus-theirs\` copy exists. Pulling again also refreshes every file you have not edited. A new file whose path is already taken is a conflict too: pull it and merge, or choose another path. \`--replace\` overwrites the current version whatever it is; use it only when that is deliberate.

## Move, link, and read

\`haus artifact mv <from> <to>\` moves or renames a file or a whole folder. Links and ids do not change, and a push of an unchanged pulled file follows its move. Pull the folder again to refresh local copies.

Put the stable_url that push prints in your message: Haus renders a link to its own Server's artifact as a chip and preview tile. Do not also attach the file. A link ending in \`/artifacts/<id>\` names that artifact: run \`haus artifact view <id>\` for it (view also takes the whole link or a drive path). \`view\` returns a read-only cached local path pinned for this turn; never edit it. Add \`--revision-id <id>\` for a fixed revision (a link's \`?revision=\` value), or pull the file to work on it. \`versions <id-or-path>\` lists retained revisions.

## Deletion

\`haus artifact delete <id-or-path>\` removes an artifact; \`--revision-id <id>\` removes a historical revision. Haus allows deletion only by the creator or a human Server Owner or Admin; treat deleting anything you did not create as a human decision.

New macOS workspaces have finite filesystem capacity. A disk-full error means you should remove unneeded personal files, including pulled copies you are done with. Home, session state and runtime control files remain outside the workspace so cleanup can continue. Existing workspaces remain uncapped until the operator explicitly migrates them.`,
};
