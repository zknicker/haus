/**
 * The checkout Haus runs for a Task's `--repo` before its session's first turn (ADR 0060,
 * specs/tasks.md#worktrees-commits-and-pull-requests), as that turn's opening lines.
 */
export function composeTaskCheckout(input: {
    failed: boolean;
    output: string;
    ref: string | null;
    repo: string;
}) {
    const what = `${input.repo}${input.ref ? ` at ${input.ref}` : ''}`;
    const command = taskCheckoutCommand(input);
    return input.failed
        ? `[Haus task checkout] Haus could not check out ${what} for you. Run \`${command}\` yourself once the cause below is fixed.\n${input.output.trim()}`
        : `[Haus task checkout] Haus checked out ${what} for you with \`${command}\`:\n${input.output.trim()}`;
}

export function taskCheckoutCommand(input: { ref: string | null; repo: string }) {
    return `haus repo checkout ${input.repo}${input.ref ? ` --ref ${shellQuoted(input.ref)}` : ''}`;
}

function shellQuoted(value: string) {
    return /^[\w./@-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}
