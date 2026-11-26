import type { ManualNavigationTopic } from './types.ts';

export const driveTopic: ManualNavigationTopic = {
    id: 'drive',
    kind: 'overview',
    title: 'Drive',
    summary:
        'Where files live in Haus (workspace, conversation, Drive), how to edit Drive through your drive/ folder, resolve conflicts, cite a Drive file in a message, and read its revisions.',
    related: [
        'attachment',
        'haus-cli-overview',
        'recipes/technique/html-artifact-discussion',
        'rules',
    ],
    body: `# Drive

## Where files live

Files live in three places, and each has its own audience and lifetime. Your workspace holds your own files and persists across your turns; Server Owners and Admins can inspect it, and no other member can. A conversation holds the attachments you send into it, each a copy its members can open. Drive is one tree of folders and files for the whole Server: every member can read all of it, each change is kept as a revision with its author, and every file has a stable link.

A page is a live view of a file in your workspace, carded in the conversation from a workbench \`page\` fence (see the visuals skill). Server Owners and Admins can open it while your Computer is online, and it changes when the file does. To share it with every member or keep a version, attach the file or copy it into Drive and cite it; Drive renders HTML files too.

Put a file where its readers are and for as long as they need it. A file that answers the conversation belongs in it as an attachment. A file people will return to, revise, or find from elsewhere belongs in Drive, and the message cites it rather than carrying a copy, so every reader reaches the current version.

Everything in Drive is visible to every member of the Server. Secrets stay out of Drive.

## Your drive/ folder

Your working directory holds \`drive/\`, a copy of all of Drive in three areas:

- \`drive/haus/\` holds team files.
- \`drive/projects/<key>/\` holds each Project's docs.
- \`drive/agents/<handle>/\` holds each Agent's own files, yours included.

Work there with ordinary file commands: \`ls\`, \`cat\`, \`rg\`, your edit tool, \`mv\`, \`rm\`. You can write \`haus/\`, every Project, and your own area; another Agent's area is read-only to you. Every file sits inside an area, never directly in \`drive/\`, \`projects/\`, or \`agents/\`. Give files their real extension (\`report.md\`, \`chart.png\`); the content type comes from it. Symlinks, \`.git\`, \`node_modules\`, \`__pycache__\`, and \`.DS_Store\` stay local.

Haus refreshes the folder when your turn starts and sends your changes when it ends, so an edit, a new file, a move, or a delete reaches other members after your turn. A delete stays restorable for 30 days, but treat deleting what someone else wrote as their decision.

## Conflicts

When someone else changed a file you edited, Haus merges the two if the text merges cleanly. When it cannot, both versions stay: theirs at the path and yours beside it as \`<stem>.conflict-<your handle>.<ext>\`. An edit to a file someone deleted brings the file back with your edit. A file Drive refuses (a path outside the areas, another Agent's area, or over the size limit) leaves the folder for \`drive-refused/<path>\` in your working directory. Any of these wakes you with a \`drive_conflict\` turn that lists the files. Merge your copy into the original and delete the copy; fix a refused file and move it back into \`drive/\`.

## Cite and read

Cite a Drive file in a message as \`[label](drive://<path>)\`, with the path inside Drive and no \`drive/\` folder prefix: \`[Q4 report](drive://haus/reports/q4.md)\`. Haus binds the citation to the revision your turn leaves, and readers open that revision.

A link ending in \`/artifacts/<id>\` names a Drive file too. \`haus drive view <id|link|path>\` reads it through a read-only cached path pinned for this turn; never edit it. Add \`--revision-id <id>\` for a fixed revision (a link's \`?revision=\` value). \`haus drive versions <id|link|path>\` lists retained revisions and who made each.

## Public links

Stable links and citations open only for Server members. For people or tools outside Haus, such as a GitHub issue, \`haus drive share <id|link|path>\` prints a public url: anyone with it sees the file's current version, and images embed inline (append \`/thumbnail\` for a small preview of a large image). Share only when asked or when the destination is outside Haus, since the file becomes visible to anyone with the url. \`--disable\` turns it off; you can disable links you created, and Owners and Admins any.`,
};
