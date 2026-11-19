// The channel name IS its handle (specs/haus-cli.md §2): one token, 1-32
// chars, no spaces. Renames change the handle, so create and rename enforce
// the same rule the runtime does.
const channelHandlePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u;

export function isValidChannelHandle(value: string) {
    return channelHandlePattern.test(value);
}

/**
 * The validation message for a typed channel name, or null while the field is
 * still empty or already valid.
 */
export function channelHandleIssue(value: string) {
    const trimmed = value.trim();

    return trimmed.length > 0 && !isValidChannelHandle(trimmed)
        ? 'Project names are single handles: letters, numbers, dashes, or underscores — no spaces, up to 32 characters.'
        : null;
}
