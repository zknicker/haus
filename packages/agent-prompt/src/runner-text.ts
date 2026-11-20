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
        'Views, creates, and edits text files on your machine: `view` a file, a directory, or a PDF as its text plus images of its scanned and figure pages (on a PDF, `view_range` selects pages and shows each one as an image), `create` a file with `file_text`, `str_replace` an exact unique `old_str` with `new_str`, or `insert` `new_str` after `insert_line`.',
    view_image: 'Shows you an image file from your machine.',
    web_fetch:
        'Fetches one public http or https URL and returns the page as Markdown. It runs in Haus, not on your machine, so it cannot reach private or local addresses.',
    web_search:
        'Searches the web and returns what it found with links to the sources. Use `web_fetch` to read a source in full.',
} as const;

/** Ends a machine write whose bytes never reached the Server, so no invocation was sent. */
export const runnerUnsentWrite = {
    cancelled: 'Nothing was written.',
    failed: (reason: string) =>
        `The bytes could not reach the Server, so nothing was written. ${reason}`,
} as const;

/** One page of a PDF in `view`: its extracted text under its page marker. */
export function composePdfPage(page: number, total: number, text: string) {
    return `[Page ${page} of ${total}]\n${text.trim() || '(No text on this page.)'}`;
}

/** The lines `view` adds after a PDF's pages: what it cut, what it left out, and how to see it. */
export const pdfViewNotes = {
    continue: (
        shown: { first: number; last: number },
        total: number,
        next: readonly [number, number]
    ) =>
        `[Showing ${pageSpan(shown.first, shown.last)} of ${total}. Use view_range [${next[0]}, ${next[1]}] to continue.]`,
    cut: (page: number, limit: string) =>
        `[Page ${page} is over the ${limit} limit, so it was cut.]`,
    imageFailed: (page: number, reason: string) =>
        `Page ${page} could not be shown as an image. ${reason}`,
    invalidRange: (range: readonly [number, number], total: number) =>
        `Invalid view_range [${range[0]}, ${range[1]}]: on a PDF it selects pages, from 1 to ${total}, and an end of -1 runs to the last page.`,
    moreFigures: (pages: readonly number[]) =>
        `${pageList(pages)} also ${pages.length === 1 ? 'has' : 'have'} figures or scanned content. view_range [${pages[0]}, ${pages[0]}] shows a page with its image, and a range shows up to 10 pages with their images.`,
    rangeWithoutImages: (pages: readonly number[]) =>
        `${pageList(pages)} ${pages.length === 1 ? 'is' : 'are'} shown without images, because a view shows up to 10 page images. Use view_range [${pages[0]}, ${pages.at(-1)}] to see them.`,
} as const;

/** The machine's refusal to return a PDF over the `view` cap, given the file's formatted size. */
export function composePdfTooLarge(size: string) {
    return `PDF is ${size}; the limit is 25 MiB.`;
}

/** What `view` shows when a PDF's text cannot be extracted. */
export function composePdfUnreadable(reason: string) {
    return `Could not read the text of this PDF. ${reason}`;
}

function pageSpan(first: number, last: number) {
    return first === last ? `page ${first}` : `pages ${first}-${last}`;
}

function pageList(pages: readonly number[]) {
    const runs: [number, number][] = [];
    for (const page of pages) {
        const run = runs.at(-1);
        if (run && run[1] === page - 1) {
            run[1] = page;
        } else {
            runs.push([page, page]);
        }
    }
    const spans = runs.map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`));
    const listed =
        spans.length === 1 ? spans[0] : `${spans.slice(0, -1).join(', ')} and ${spans.at(-1)}`;
    return `${pages.length === 1 ? 'Page' : 'Pages'} ${listed}`;
}

/** What `web_search` answers on a Pi Agent whose provider's search is off. */
export const webSearchNotConfigured =
    'Web search is not configured for this Haus. Use `web_fetch` to read a URL you already know.';
