import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';
import {
    composePdfPage,
    composePdfTooLarge,
    composePdfUnreadable,
    composeUnknownToolCalls,
    pdfViewNotes,
    runnerMachineFacts,
    runnerRuntimeVersions,
    runnerToolDescriptions,
    runnerUnsentWrite,
    webSearchNotConfigured,
} from './runner-text.ts';

test('the turn after a runner crash names each tool call whose outcome is unknown', () => {
    expect(composeUnknownToolCalls(['toolu_1', 'toolu_2'])).toBe(
        'Haus restarted during your last turn, so these tool calls may or may not have taken effect: toolu_1, toolu_2. Check their effects before running them again.'
    );
    expect(composeUnknownToolCalls([])).toBeNull();
});

test('a runner render says its tools run on the Agent machine, not where the runner lives', () => {
    const prompt = renderAgentInstructions({
        ...runnerMachineFacts,
        runtimeVersion: runnerRuntimeVersions['claude-agent-sdk'],
        agentId: 'agt_blippy',
        agentName: 'Blippy',
        homeTimezone: 'UTC',
        initialRole: null,
        supportsSubagents: false,
    });

    expect(prompt).toContain(
        [
            '- Agent: @Blippy (agt_blippy)',
            '- Hostname: not known to Haus; your tools run on your machine',
            '- OS: not known to Haus',
            '- Runtime: Haus runner, Claude Agent SDK',
            '- Workspace: your working directory on your machine, where every bash call starts',
            '- Home timezone: UTC',
        ].join('\n')
    );
    expect(prompt).not.toContain('## Working through sub-agents');
    expect(runnerRuntimeVersions['pi-durable']).toBe('Haus runner, Pi Durable');
});

test('the runner tools describe how each one works', () => {
    expect(runnerToolDescriptions).toEqual({
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
    });
});

test('a write whose bytes never reached the Server says nothing was written', () => {
    expect(runnerUnsentWrite.failed('The Server refused the payload upload (HTTP 413).')).toBe(
        'The bytes could not reach the Server, so nothing was written. The Server refused the payload upload (HTTP 413).'
    );
    expect(runnerUnsentWrite.cancelled).toBe('Nothing was written.');
});

test("a PDF's view marks each page, and says when a page has no text", () => {
    expect(composePdfPage(1, 3, 'First page text\n')).toBe('[Page 1 of 3]\nFirst page text');
    expect(composePdfPage(2, 3, ' \n')).toBe('[Page 2 of 3]\n(No text on this page.)');
    expect(composePdfTooLarge('26.0MB')).toBe('PDF is 26.0MB; the limit is 25 MiB.');
    expect(composePdfUnreadable('Invalid PDF structure.')).toBe(
        'Could not read the text of this PDF. Invalid PDF structure.'
    );
});

test("a PDF's view names what it cut and left out, and the view_range that shows it", () => {
    expect(pdfViewNotes.continue({ first: 1, last: 12 }, 40, [13, -1])).toBe(
        '[Showing pages 1-12 of 40. Use view_range [13, -1] to continue.]'
    );
    expect(pdfViewNotes.continue({ first: 3, last: 3 }, 40, [4, 9])).toBe(
        '[Showing page 3 of 40. Use view_range [4, 9] to continue.]'
    );
    expect(pdfViewNotes.cut(3, '50.0KB')).toBe('[Page 3 is over the 50.0KB limit, so it was cut.]');
    expect(pdfViewNotes.moreFigures([7, 8, 9, 12, 20, 21])).toBe(
        'Pages 7-9, 12 and 20-21 also have figures or scanned content. view_range [7, 7] shows a page with its image, and a range shows up to 10 pages with their images.'
    );
    expect(pdfViewNotes.moreFigures([4])).toBe(
        'Page 4 also has figures or scanned content. view_range [4, 4] shows a page with its image, and a range shows up to 10 pages with their images.'
    );
    expect(pdfViewNotes.rangeWithoutImages([11, 12])).toBe(
        'Pages 11-12 are shown without images, because a view shows up to 10 page images. Use view_range [11, 12] to see them.'
    );
    expect(pdfViewNotes.rangeWithoutImages([11])).toBe(
        'Page 11 is shown without images, because a view shows up to 10 page images. Use view_range [11, 11] to see them.'
    );
    expect(pdfViewNotes.imageFailed(2, 'Canvas could not load.')).toBe(
        'Page 2 could not be shown as an image. Canvas could not load.'
    );
    expect(pdfViewNotes.invalidRange([5, 9], 3)).toBe(
        'Invalid view_range [5, 9]: on a PDF it selects pages, from 1 to 3, and an end of -1 runs to the last page.'
    );
});

test('a Pi Agent without search hears that it is not configured and where to go instead', () => {
    expect(webSearchNotConfigured).toBe(
        'Web search is not configured for this Haus. Use `web_fetch` to read a URL you already know.'
    );
});
