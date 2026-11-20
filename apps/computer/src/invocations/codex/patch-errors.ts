export class PatchParseError extends Error {}

export const firstLineMessage = "The first line of the patch must be '*** Begin Patch'";
export const lastLineMessage = "The last line of the patch must be '*** End Patch'";

export function invalidPatch(message: string) {
    return new PatchParseError(`Invalid patch: ${message}`);
}

export function invalidHunk(message: string, lineNumber: number) {
    return new PatchParseError(`Invalid patch hunk on line ${lineNumber}: ${message}`);
}

export function invalidHunkHeader(trimmed: string, lineNumber: number) {
    return invalidHunk(
        `'${trimmed}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`,
        lineNumber
    );
}

export function unexpectedUpdateLine(line: string, lineNumber: number) {
    return invalidHunk(
        `Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
        lineNumber
    );
}

export function expectedContextMarker(line: string, lineNumber: number) {
    return invalidHunk(
        `Expected update hunk to start with a @@ context marker, got: '${line}'`,
        lineNumber
    );
}
