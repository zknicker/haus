import type { ComputerSecretItem, OnePasswordItem, OnePasswordSecondaryField } from '@haus/api';
import { keychainItemNotFoundExitCode, securityPath } from './keychain.ts';
import { secretsRuntimePlugin } from './runtime.ts';

/** A vault item Agents can use: its env name plus the reference Varlock resolves. */
export interface SecretBinding extends ComputerSecretItem {
    reference: string;
}

/** Names the wrapper or Varlock already own, or that would change how a command runs. */
const reservedNames = new Set(['HAUS_OP_TOKEN', 'HOME', 'PATH', 'PWD', 'SHELL', 'TMPDIR', 'USER']);

/**
 * Maps vault items to environment variables. References use vault and item
 * ids, so titles with `/` or quotes cannot break the `op://` path, and a
 * renamed item keeps resolving until the next refresh renames its variable.
 *
 * Pass 1 binds each item's primary field under its title (`<TITLE>`), exactly
 * as before. Pass 2 binds every secondary field under `<TITLE>_<FIELD>`,
 * deduping against the same `taken` set so a primary name always wins a
 * collision against a same-named secondary.
 */
export function secretBindings(
    vaultId: string,
    items: readonly OnePasswordItem[],
    secondaryFields: readonly OnePasswordSecondaryField[] = []
): SecretBinding[] {
    const taken = new Set<string>();
    const bindings: SecretBinding[] = [];
    const titlesById = new Map<string, string>();
    for (const item of [...items].sort((a, b) => a.title.localeCompare(b.title))) {
        const envName = uniqueName(envNameForTitle(item.title), taken);
        taken.add(envName);
        titlesById.set(item.id, item.title);
        bindings.push({
            envName,
            reference: `op://${vaultId}/${item.id}/${item.field}`,
            title: item.title.trim().slice(0, 200) || item.id,
        });
    }
    const secondary = secondaryFields
        .flatMap((field) => {
            const title = titlesById.get(field.itemId);
            return title ? [{ field, title }] : [];
        })
        .sort(
            (a, b) => a.title.localeCompare(b.title) || a.field.label.localeCompare(b.field.label)
        );
    for (const { field, title } of secondary) {
        const envName = uniqueName(envNameForTitle(`${title} ${field.label}`), taken);
        taken.add(envName);
        bindings.push({
            envName,
            reference: `op://${vaultId}/${field.itemId}/${field.fieldId}`,
            title,
        });
    }
    return bindings.slice(0, 200);
}

/** "Dummy API Key" → DUMMY_API_KEY; a leading digit gains an underscore. */
export function envNameForTitle(title: string): string {
    const base = title
        .normalize('NFKD')
        .toUpperCase()
        .replaceAll(/[^A-Z0-9]+/g, '_')
        .replaceAll(/^_+|_+$/g, '')
        .slice(0, 100);
    const name = /^[0-9]/.test(base) ? `_${base}` : base || 'SECRET';
    // Varlock reads its own `VARLOCK_*` variables (such as VARLOCK_ENV) as configuration.
    return reservedNames.has(name) || name.startsWith('VARLOCK_') ? `OP_${name}` : name;
}

/**
 * The Varlock schema Agents run under. A token with app auth off selects the
 * plugin's 1Password SDK mode, so resolution needs no `op` CLI. The token is
 * `@internal`: Varlock uses it to resolve items but strips it from the child's
 * environment. No comment carries a vault or item title, because Varlock
 * parses comments as decorators.
 */
export function renderSecretsSchema(bindings: readonly SecretBinding[]): string {
    return [
        '# Managed by Haus Computer. Regenerated on connect and refresh; edits are overwritten.',
        `# @plugin(${secretsRuntimePlugin})`,
        '# @initOp(token=$HAUS_OP_TOKEN, allowAppAuth=false)',
        '# @defaultSensitive=true',
        '# @defaultRequired=false',
        '# ---',
        '',
        '# @type=opServiceAccountToken @sensitive @internal',
        'HAUS_OP_TOKEN=',
        '',
        ...bindings.map((binding) => `${binding.envName}=op("${binding.reference}")`),
        '',
    ].join('\n');
}

/**
 * The `haus-secrets` command on every Agent's PATH. It reads the token from
 * the Keychain into a shell variable and exports it only into the Varlock
 * process it execs; the Agent's own environment never holds it.
 */
export function renderSecretsWrapper(input: {
    account: string;
    bindings: readonly SecretBinding[];
    keychainPath: string;
    schemaDir: string;
    /** Tests swap in a stub; production always uses `/usr/bin/security`. */
    securityPath?: string;
    service: string;
    varlockPath: string;
}): string {
    const names = input.bindings.map((binding) => shellQuote(binding.envName)).join(' ');
    return [
        '#!/bin/sh',
        "# Managed by Haus Computer: runs a command with this Computer's 1Password vault secrets.",
        '# Usage: haus-secrets -- <command> [args...]    List names: haus-secrets --list',
        'if [ "$1" = "--list" ]; then',
        names ? `    printf '%s\\n' ${names}` : '    :',
        '    exit 0',
        'fi',
        `token=$(${shellQuote(input.securityPath ?? securityPath)} find-generic-password -s ${shellQuote(input.service)} -a ${shellQuote(input.account)} -w ${shellQuote(input.keychainPath)} 2>/dev/null)`,
        'code=$?',
        `if [ "$code" -eq ${keychainItemNotFoundExitCode} ]; then`,
        `    echo "haus-secrets: this Computer has no 1Password connection. Ask the Server Owner to connect one in Computer settings." >&2`,
        '    exit 78',
        'elif [ "$code" -ne 0 ]; then',
        `    echo "haus-secrets: this Computer's Keychain is locked, so the 1Password token cannot be read. Someone must log in on the Computer to unlock it." >&2`,
        '    exit 78',
        'fi',
        'export HAUS_OP_TOKEN="$token" VARLOCK_TELEMETRY_DISABLED=1',
        'unset code token __VARLOCK_ENV',
        `exec ${shellQuote(input.varlockPath)} run --path ${shellQuote(`${input.schemaDir}/`)} --inject vars "$@"`,
        '',
    ].join('\n');
}

function uniqueName(name: string, taken: ReadonlySet<string>): string {
    if (!taken.has(name)) {
        return name;
    }
    let index = 2;
    while (taken.has(`${name}_${index}`)) {
        index += 1;
    }
    return `${name}_${index}`;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}
