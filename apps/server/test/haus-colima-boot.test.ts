import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const operationsRoot = join(serverRoot, 'operations');

test('recognizes disabled launchctl service output variants', () => {
    const parserPath = join(operationsRoot, 'launchctl-service-disabled');
    const label = 'com.merchbaseco.colima-autostart';
    const fixtures = [
        {
            disabled: true,
            output: `disabled services = {\n\t"${label}" => disabled\n}\n`,
        },
        {
            disabled: true,
            output: `disabled services = {\n\t"${label}" => true\n}\n`,
        },
        {
            disabled: false,
            output: `disabled services = {\n\t"${label}" => enabled\n}\n`,
        },
        {
            disabled: false,
            output: `disabled services = {\n\t"${label}" => false\n}\n`,
        },
        {
            disabled: false,
            output: 'disabled services = {\n\t"com.example.other" => disabled\n}\n',
        },
    ];

    for (const fixture of fixtures) {
        const parsed = Bun.spawnSync(
            [
                '/bin/sh',
                '-c',
                'printf "%s" "$LAUNCHCTL_OUTPUT" | /bin/sh "$PARSER_PATH" "$SERVICE_LABEL"',
            ],
            {
                env: {
                    ...process.env,
                    LAUNCHCTL_OUTPUT: fixture.output,
                    PARSER_PATH: parserPath,
                    SERVICE_LABEL: label,
                },
                stderr: 'pipe',
                stdout: 'pipe',
            }
        );
        expect(parsed.exitCode).toBe(fixture.disabled ? 0 : 1);
    }
});
