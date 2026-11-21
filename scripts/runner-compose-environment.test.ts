import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerConfigNames } from '../apps/runner/src/config.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

describe('runner container environment', () => {
    test('compose or the image sets every name the runner config reads', () => {
        const compose = Bun.YAML.parse(
            readFileSync(join(repositoryRoot, 'apps/server/compose.yml'), 'utf8')
        ) as { services: Record<string, { environment: Record<string, string> }> };
        const forwarded = Object.keys(compose.services['haus-runner']?.environment ?? {});
        const imageSet = [
            ...readFileSync(join(repositoryRoot, 'apps/runner/Dockerfile'), 'utf8').matchAll(
                /^ENV (\w+)=/gmu
            ),
        ].map(([, name]) => name);

        expect(
            runnerConfigNames.filter(
                (name) => !(forwarded.includes(name) || imageSet.includes(name))
            )
        ).toEqual([]);
    });

    test('the runner reaches the loopback Server through Lima, never a Docker host-gateway alias', () => {
        const compose = Bun.YAML.parse(
            readFileSync(join(repositoryRoot, 'apps/server/compose.yml'), 'utf8')
        ) as {
            services: Record<
                string,
                { environment: Record<string, string>; extra_hosts?: string[] }
            >;
        };
        const runner = compose.services['haus-runner'];

        expect(runner?.environment.HAUS_SERVER_URL).toMatch(
            /:-http:\/\/host\.lima\.internal:18791\}$/u
        );
        expect(runner?.extra_hosts).toBeUndefined();
    });
});
