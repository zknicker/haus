/** Reads Agent CLI stdin from both pipes and seekable shell redirections. */
export async function readAgentStdin(): Promise<string> {
    return await Bun.stdin.text();
}

/** Reads Agent CLI stdin as raw bytes, so a binary file arrives unchanged. */
export async function readAgentStdinBytes() {
    return Buffer.from(await Bun.stdin.arrayBuffer());
}
