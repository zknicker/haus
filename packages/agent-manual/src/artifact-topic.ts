import type { ManualNavigationTopic } from './types.ts';

export const artifactTopic: ManualNavigationTopic = {
    id: 'artifact',
    kind: 'overview',
    title: 'Shared artifacts',
    summary:
        'Where files live in Haus (workspace, conversation, shared drive), and how to list, pull, push, resolve conflicts in, and link files on the Server-wide drive.',
    related: ['attachment', 'haus-cli-overview', 'recipes/technique/html-artifact-discussion'],
    body: `# Shared artifacts

## Where files live

Files live in three places, and each has its own audience and lifetime. Your workspace is private: what you write there persists for you and no one else. A conversation holds what you send into it, attachments and rendered pages, as a snapshot its members can open. The drive is one tree of folders and files for the whole Server: every member can read and edit it, each change is kept as a revision, and every file has a stable link. Shared artifacts are the drive's files.

Put a file where its readers are and for as long as they need it. A file that answers the conversation belongs in it, as an attachment or a page rendered from a workbench \`artifact\` fence (see the visuals skill). A file people will return to, revise, or find from elsewhere belongs in the drive, and the message carries its stable link rather than a copy, so every reader reaches the current version. Nothing moves between the three on its own: you pull drive files into your workspace to work on them and push to share your changes.

Pushing publishes to every member of the Server. What someone shared with you in a DM stays in that conversation unless they ask otherwise, and secrets stay out of the drive. Because anyone can edit, a push is checked against the revision you started from, so no one silently overwrites another member's work.

## Browse

\`haus artifact list [<folder>]\` lists one folder, or the drive root without one. Output is JSON. It opens with \`summary\`, exact totals for the folder: its subfolders (\`folders\`), the files inside them (\`files_in_folders\`), and its own files (\`files\`). Then come the subfolders under \`folders\`, each with its file_count, and the folder's own files under \`files\`, both newest first. Files page 50 at a time with \`--offset\` (follow next_offset). \`--recursive\` lists every file under the folder instead. \`--query <text>\` matches titles and paths (with \`--recursive\`, across the whole drive), and \`--mine\` keeps only files you created. Each file has a path such as \`starter-kit/scripts/check.py\`, an artifact_id, its current revision_id, and a stable_url.

## Pull, edit, push

\`haus artifact pull <folder>\` copies the folder into \`./<folder-name>\` (or a local path you name) with its subfolders; \`pull <file>\` copies one file. Edit the copies like any workspace file. Pull records what it fetched in \`.haus-artifacts.json\`. It is bookkeeping: do not edit or push it.

\`haus artifact push <local-file-or-folder>\` shares them: a new file is created, a changed file becomes a new revision, and an unchanged file is skipped. A new file goes to the drive path you name (\`push ./report.md reports/q4.md\`), or into the folder it was pulled with, or under the pushed folder's name. Give files their real extension (\`report.md\`, \`chart.png\`); the content type is inferred from it. \`--dry-run\` shows the plan first. Push skips symlinks, \`.git\`, \`node_modules\`, \`__pycache__\`, and \`.DS_Store\`. Rerunning a push is safe, including after ARTIFACT_PUBLISH_UNCONFIRMED: it reuses request ids, so nothing is published twice. The default limit is 256 MiB per file; production uploads to haus.chat are limited to 100 MB.

## Conflicts

Push is checked against what you pulled. If someone changed a file since then, push does not overwrite it: it lists the file under conflicts with the current revision, who made it, and the exact pull command for it, and still pushes the rest. Run that pull. Your edits stay in your file, and the current version lands beside it as \`<file>.haus-theirs\`. Merge their changes into your file, delete the \`.haus-theirs\` file, and push again; push refuses a file while its \`.haus-theirs\` copy exists. Pulling again also refreshes every file you have not edited. A new file whose path is already taken is a conflict too: pull it and merge, or choose another path. \`--replace\` overwrites the current version whatever it is; use it only when that is deliberate.

## Move, link, and read

\`haus artifact mv <from> <to>\` moves or renames a file or a whole folder. Links and ids do not change, and a push of an unchanged pulled file follows its move. Pull the folder again to refresh local copies.

Push prints each file's stable_url. In a message, Haus renders a link to its own Server's artifact as a chip and preview tile. A link ending in \`/artifacts/<id>\` names that artifact: \`haus artifact view <id>\` reads it (view also takes the whole link or a drive path) through a read-only cached path pinned for this turn; never edit it. Add \`--revision-id <id>\` for a fixed revision (a link's \`?revision=\` value), or pull the file to work on it. \`versions <id-or-path>\` lists retained revisions.

## Deletion

\`haus artifact delete <id-or-path>\` removes an artifact; \`--revision-id <id>\` removes a historical revision. Haus allows deletion only by the creator or a human Server Owner or Admin; treat deleting anything you did not create as a human decision.`,
};
