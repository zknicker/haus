import type { ManualNavigationTopic } from './types.ts';

/** Targeting a machine tool call at a Computer other than the Agent's home (ADR 0057 decision 4). */
export const computersTopic: ManualNavigationTopic = {
    aliases: ['home computer', 'other computer', 'computer target'],
    id: 'computers',
    kind: 'overview',
    related: ['attachment', 'drive', 'haus-cli-overview'],
    summary:
        'Run a tool call on another Computer with the `computer` field, find Computers with haus computer list, and read its refusals.',
    title: 'Computers',
    body: `# Computers

Your home is the Computer you were created on. Your \`drive/\` folder lives there, and every tool call that names no Computer runs there.

**Targeting a call.** Every machine tool takes an optional \`computer\` field, a Computer id or its name: \`bash\`, \`str_replace_based_edit_tool\`, \`shell\`, \`apply_patch\`, \`view_image\`, and \`execute\`'s \`browser\` and \`desktop\` built-ins, whose input is \`{ args, computer }\`. Nothing stays switched: name the Computer on every call that should run there, and leave it out to run on your home. A named Computer never falls back to your home. A text result from another Computer starts with \`[Ran on <name>]\`.

**Finding one.** \`haus computer list\` prints one line per Computer on the Server, such as \`MacBook (cmp_123) · online · macOS · allowed · computer use\`: its name and id, \`online\` or \`offline\`, its OS, then \`home\`, \`allowed\`, or \`no access\`, and \`computer use\` when a \`desktop\` call from you would pass there. Use the id when two Computers share a name. In replies, call a Computer by its name ("the MacBook").

**Who allows you.** Your home always does. Another Computer allows you only after the person who attached it adds you on its Device page; nobody else can, and Owners and Admins can only remove you. A \`desktop\` call there also needs that Computer's computer use to name you.

**Refusals.** A refused call ran nothing, and its text names the Computer.
- \`not-found\`: no Computer on the Server has that id or name. A name that several share refuses with their ids.
- \`no-access\`: that Computer has not allowed you. Ask the person who attached it, whom the refusal names, once, where you are working.
- \`off\`, \`not-listed\`, \`not-mac\`, \`not-ready\`, \`locked\`, \`no-session\`, \`switched-out\`: computer use refused a \`desktop\` call, as it does on your home.
- \`offline\`: the Computer is not connected. It answers at once, and you can keep working on others.

**Working there.** On a Computer other than your home, calls start in your own folder there, with \`HOME\` set to its sibling \`home\`. That folder has no \`drive/\`: Drive stays on your home. \`~\` is your own \`HOME\`, so reach a person's files by absolute path, such as \`/Users/ada/Desktop/report.pdf\`. Their ssh keys, \`gh\` login, and git config are not in your \`HOME\`. You still run as that machine's user and can read what it can, so do only what was asked. \`bash\` has no working directory field, so \`cd\` in the command; \`shell\` takes \`workdir\`.

**\`haus\` and machine paths.** \`haus\` commands run in Haus, but a flag that names a path (\`haus attachment upload --path\`, \`haus attachment view --output\`, and the like) reads or writes it on the Computer the enclosing \`bash\` or \`shell\` call targets. To post a screenshot of the MacBook:
1. \`desktop\` with \`{ args: ["screenshot", "/tmp/shot.png"], computer: "macbook" }\`.
2. \`bash\` with \`computer: "macbook"\` running \`haus attachment upload --path /tmp/shot.png\`, then send the message with \`--attachment-id\`.

**Copying between Computers.** Upload the file with \`haus attachment upload --path\` in a call that targets the first, then \`haus attachment view <id> --output <path>\` in a call that targets the second.

**Scratch.** Your folders on other Computers are scratch. Full Reset recreates only your home's folders, and retiring you removes them everywhere. Keep what matters in Drive or in a message.`,
};
