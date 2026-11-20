import { Effect } from 'effect';

type TokenProcess = Pick<Bun.Subprocess<'ignore', 'pipe', 'ignore'>, 'exited' | 'stdout' | 'kill'>;

/** One credential cache per daemon reader; cancellation never caches a missing credential. */
export function createGithubTokenReader(
    spawn: () => TokenProcess = () =>
        Bun.spawn(['gh', 'auth', 'token'], {
            stderr: 'ignore',
            stdin: 'ignore',
            stdout: 'pipe',
        })
): Effect.Effect<string | null> {
    let cached: { token: string | null } | undefined;
    return Effect.suspend(() => {
        if (cached) {
            return Effect.succeed(cached.token);
        }
        return readToken(spawn).pipe(
            Effect.catchAll(() =>
                Effect.logDebug('GitHub token unavailable').pipe(Effect.as(null))
            ),
            Effect.tap((token) =>
                Effect.sync(() => {
                    cached = { token };
                })
            )
        );
    });
}

function readToken(spawn: () => TokenProcess) {
    return Effect.suspend(() => {
        let pending: Promise<{ value: string | null } | { cause: unknown }> | undefined;
        return Effect.acquireUseRelease(
            Effect.try(spawn),
            (child) => {
                pending = Promise.resolve()
                    .then(async () => {
                        const [exitCode, output] = await Promise.all([
                            child.exited,
                            new Response(child.stdout).text(),
                        ]);
                        return exitCode === 0 ? output.trim() || null : null;
                    })
                    .then(
                        (value) => ({ value }),
                        (cause: unknown) => ({ cause })
                    );
                const result = pending;
                return Effect.promise(() => result).pipe(
                    Effect.flatMap((outcome) =>
                        'cause' in outcome
                            ? Effect.fail(outcome.cause)
                            : Effect.succeed(outcome.value)
                    ),
                    Effect.timeout('5 seconds')
                );
            },
            (child) =>
                Effect.promise(async () => {
                    child.kill('SIGKILL');
                    await child.exited;
                    // Read errors belong to the use phase; killing a pipe may also reject its read.
                    await pending;
                })
        );
    });
}
