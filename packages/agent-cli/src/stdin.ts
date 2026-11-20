/** Reads Agent CLI stdin from both pipes and seekable shell redirections. */
export async function readAgentStdin(): Promise<string> {
    return await Bun.stdin.text();
}
