/** The runner's lines in the prompt's Current Runtime Context: its tools reach the Agent's machine, never the runner's host. */
export const runnerMachineFacts = {
    hostname: 'not known to Haus; your tools run on your machine',
    os: 'not known to Haus',
    workspacePath: 'your working directory on your machine, where every bash call starts',
} as const;

/** The Runtime line of the Current Runtime Context, by the runner harness the Agent's model runs on. */
export const runnerRuntimeVersions = {
    'claude-agent-sdk': 'Haus runner, Claude Agent SDK',
    'pi-durable': 'Haus runner, Pi Durable',
} as const;

/** Leads the turn after a runner crash, naming the tool calls whose outcome died with it. */
export function composeUnknownToolCalls(toolCallIds: readonly string[]) {
    if (toolCallIds.length === 0) {
        return null;
    }
    return `Haus restarted during your last turn, so these tool calls may or may not have taken effect: ${toolCallIds.join(', ')}. Check their effects before running them again.`;
}

/** The model-facing descriptions of the runner's Haus tools, keyed by tool name. */
export const runnerToolDescriptions = {
    apply_patch:
        'Edits files on your machine with one patch between `*** Begin Patch` and `*** End Patch`: add, update, delete, or move files, with paths relative to your working directory.',
    bash: 'Runs one shell command on your machine, starting in your working directory with no state kept from the call before. A command that is exactly one `haus` invocation runs in Haus itself and works while your machine is offline.',
    execute:
        'Runs a JavaScript program against your granted tools: `tools.search`, `tools.describe`, and `tools.call`.',
    shell: 'Runs one command on your machine, given as an argv array, starting in your working directory or `workdir` with no state kept from the call before. A command that is exactly one `haus` invocation, alone or as the script of `bash -lc`, runs in Haus itself and works while your machine is offline.',
    str_replace_based_edit_tool:
        'Views, creates, and edits text files on your machine: `view` a file, a PDF as its text, or a directory, `create` a file with `file_text`, `str_replace` an exact unique `old_str` with `new_str`, or `insert` `new_str` after `insert_line`.',
    view_image: 'Shows you an image file from your machine.',
} as const;

/** Ends a machine write whose bytes never reached the Server, so no invocation was sent. */
export const runnerUnsentWrite = {
    cancelled: 'Nothing was written.',
    failed: (reason: string) =>
        `The bytes could not reach the Server, so nothing was written. ${reason}`,
} as const;

/** What `view` shows of a PDF: each page's extracted text under its page marker. */
export function composePdfText(pages: readonly string[]) {
    if (pages.every((page) => page.trim().length === 0)) {
        const count = pages.length === 1 ? '1 page' : `${pages.length} pages`;
        return `This PDF has ${count} and no text layer, so its pages are likely scanned images that view cannot read.`;
    }
    return pages
        .map((text, index) => `[Page ${index + 1} of ${pages.length}]\n${text.trim()}`)
        .join('\n\n');
}

/** The machine's refusal to return a PDF over the `view` cap, given the file's formatted size. */
export function composePdfTooLarge(size: string) {
    return `PDF is ${size}; the limit is 25 MiB.`;
}

/** What `view` shows when a PDF's text cannot be extracted. */
export function composePdfUnreadable(reason: string) {
    return `Could not read the text of this PDF. ${reason}`;
}
