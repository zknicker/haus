#!/usr/bin/env bun
/**
 * A deterministic runtime that executes the real managed CLI. It stands in for
 * a model provider — no network model call — while exercising the genuine path:
 * it reads the composed turn prompt and replies through the `haus` wrapper on
 * PATH, which reaches the Server via the loopback proxy. Real harness/CLI,
 * fake model.
 */
async function main(): Promise<number> {
    const prompt = process.env.HAUS_TURN_PROMPT ?? '';
    const ask = readLatestHumanMessage(prompt);
    const reply = ask ? `Acknowledged: ${ask.content}` : 'Acknowledged.';

    const haus = Bun.which('haus') ?? process.env.HAUS_WRAPPER;
    if (!haus) {
        process.stderr.write('The haus wrapper was not found on PATH.\n');
        return 1;
    }

    const child = Bun.spawn([haus, 'message', 'send', '--target', ask?.target ?? '#all'], {
        stderr: 'inherit',
        stdin: new TextEncoder().encode(reply),
        stdout: 'inherit',
    });
    return await child.exited;
}

function readLatestHumanMessage(prompt: string): { content: string; target: string } | null {
    const matches = [...prompt.matchAll(/\[target=(\S+)[^\]]*type=human\]\s*[^:]+:\s*(.*)/gu)];
    const latest = matches.at(-1);
    return latest?.[1] && latest[2] ? { content: latest[2].trim(), target: latest[1] } : null;
}

if (import.meta.main) {
    main()
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 1;
        });
}
