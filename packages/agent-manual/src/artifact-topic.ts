import type { ManualNavigationTopic } from './types.ts';

export const filesTopic: ManualNavigationTopic = {
    id: 'files',
    kind: 'overview',
    title: 'Shared files',
    summary:
        'Where files live in Haus (workspace, conversation, Files), and how to list, pull, push, resolve conflicts in, and link the Server-wide shared files in Files.',
    related: ['attachment', 'haus-cli-overview', 'recipes/technique/html-artifact-discussion'],
    body: `# Shared files

## Where files live

Files live in three places, and each has its own audience and lifetime. Your workspace holds your own files and persists across your turns; Server Owners and Admins can inspect it, and no other member can. A conversation holds the attachments you send into it, each a copy its members can open. Files is one tree of folders and files for the whole Server: every member can read and edit it, each change is kept as a revision, and every file has a stable link.

A page is a live view of a file in your workspace, carded in the conversation from a workbench \`page\` fence (see the visuals skill). Server Owners and Admins can open it while your Computer is online, and it changes when the file does. To share it with every member or keep a version, attach the file or push it to Files and link it; Files renders HTML files too.

Put a file where its readers are and for as long as they need it. A file that answers the conversation belongs in it as an attachment. A file people will return to, revise, or find from elsewhere belongs in Files, and the message carries its stable link rather than a copy, so every reader reaches the current version. Nothing moves between the three on its own: you pull shared files into your workspace to work on them and push to share your changes.

Pushing publishes to every member of the Server. What someone shared with you in a DM stays in that conversation unless they ask otherwise, and secrets stay out of Files. Because anyone can edit, a push is checked against the revision you started from, so no one silently overwrites another member's work.

## Browse

\`haus files list [<folder>]\` lists one folder, or the top of Files without one. Output is JSON. It opens with \`summary\`, exact totals for the folder: its subfolders (\`folders\`), the files inside them (\`files_in_folders\`), and its own files (\`files\`). Then come the subfolders under \`folders\`, each with its file_count, and the folder's own files under \`files\`, both newest first. Files page 50 at a time with \`--offset\` (follow next_offset). \`--recursive\` lists every file under the folder instead. \`--query <text>\` matches titles and paths (with \`--recursive\`, across all of Files), and \`--mine\` keeps only files you created. Each file has a path such as \`starter-kit/scripts/check.py\`, an artifact_id, its current revision_id, and a stable_url.

## Pull, edit, push

\`haus files pull <folder>\` copies the folder into \`./<folder-name>\` (or a local path you name) with its subfolders; \`pull <file>\` copies one file. Edit the copies like any workspace file. Pull records what it fetched in \`.haus-artifacts.json\`. It is bookkeeping: do not edit or push it. Pulled copies use the Computer's shared disk space, so remove copies you are done with.

\`haus files push <local-file-or-folder>\` shares them: a new file is created, a changed file becomes a new revision, and an unchanged file is skipped. A new file goes to the path in Files you name (\`push ./report.md reports/q4.md\`), or into the folder it was pulled with, or under the pushed folder's name. Give files their real extension (\`report.md\`, \`chart.png\`); the content type is inferred from it. \`--dry-run\` shows the plan first. Push skips symlinks, \`.git\`, \`node_modules\`, \`__pycache__\`, and \`.DS_Store\`. Rerunning a push is safe, including after ARTIFACT_PUBLISH_UNCONFIRMED: it reuses request ids, so nothing is published twice. The default limit is 256 MiB per file; production uploads to haus.chat are limited to 100 MB.

## Conflicts

Push is checked against what you pulled. If someone changed a file since then, push does not overwrite it: it lists the file under conflicts with the current revision, who made it, and the exact pull command for it, and still pushes the rest. Run that pull. Your edits stay in your file, and the current version lands beside it as \`<file>.haus-theirs\`. Merge their changes into your file, delete the \`.haus-theirs\` file, and push again; push refuses a file while its \`.haus-theirs\` copy exists. Pulling again also refreshes every file you have not edited. A new file whose path is already taken is a conflict too: pull it and merge, or choose another path. \`--replace\` overwrites the current version whatever it is; use it only when that is deliberate.

## Move, link, and read

\`haus files mv <from> <to>\` moves or renames a file or a whole folder. Links and ids do not change, and a push of an unchanged pulled file follows its move. Pull the folder again to refresh local copies.

Push prints each file's stable_url. In a message, Haus renders a link to a file in its own Server's Files as a chip and preview tile. A link ending in \`/artifacts/<id>\` names that file: \`haus files view <id>\` reads it (view also takes the whole link or a path in Files) through a read-only cached path pinned for this turn; never edit it. Add \`--revision-id <id>\` for a fixed revision (a link's \`?revision=\` value), or pull the file to work on it. \`versions <id-or-path>\` lists retained revisions.

## Public links

Stable links open only for Server members. For people or tools outside Haus, such as a Linear issue, \`haus files share <id-or-path>\` prints a public url: anyone with it sees the file's current version, and images embed inline (append \`/thumbnail\` for a small preview of a large image). Share only when asked or when the destination is outside Haus, since the file becomes visible to anyone with the url. \`--disable\` turns it off; you can disable links you created, and Owners and Admins any.

## Deletion

\`haus files delete <id-or-path>\` removes a file; \`--revision-id <id>\` removes a historical revision. Haus allows deletion only by the creator or a human Server Owner or Admin; treat deleting anything you did not create as a human decision.`,
};
