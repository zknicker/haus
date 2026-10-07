// How many times a turn rendered its own draft with `haus visual preview`.
//
// Counted off the trace, whose entries record each tool call's input as a JSON
// string. The runtimes disagree on the shape (a `command` field, a shell
// string, an argv array), but every one of them carries the words in order.
// A `--help` call reads the flags; it does not preview anything.
const previewCommand = /haus\W+visual\W+preview/u;
const helpFlag = /--help\b/u;

/** Counts trace entries (`{ input }`) that ran a preview. */
export const countPreviewCalls = (entries) =>
    entries.filter(
        (entry) =>
            typeof entry.input === 'string' &&
            previewCommand.test(entry.input) &&
            !helpFlag.test(entry.input)
    ).length;

/** The same count over a `.trace.jsonl` file's text; unparseable lines are skipped. */
export const countPreviewCallsInTrace = (text) =>
    countPreviewCalls(
        text
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .flatMap((line) => {
                try {
                    return [JSON.parse(line)];
                } catch {
                    return [];
                }
            })
    );
