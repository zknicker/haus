export type MachinePathDirection = 'read' | 'write';

export interface MachineFlag {
    readonly direction: MachinePathDirection;
    readonly flag: string;
}

type CommandAccess =
    | { readonly kind: 'run'; readonly machineFlags: readonly MachineFlag[] }
    | { readonly kind: 'repo-checkout' }
    | { readonly kind: 'workspace'; readonly nextAction: string };

export type HausCommandAccess =
    | { readonly kind: 'run'; readonly machineFlags: readonly MachineFlag[] }
    | { readonly kind: 'refused'; readonly text: string }
    | { readonly kind: 'repo-checkout' };

const bare = '[flags]';
const serverOnly = { kind: 'run', machineFlags: [] } as const satisfies CommandAccess;
const repoCheckout = { kind: 'repo-checkout' } as const satisfies CommandAccess;
const readDriveFolder =
    'Read the current version in your `drive/` folder with file commands; `haus drive versions` lists its history.';

const commandTable: Readonly<Record<string, Readonly<Record<string, CommandAccess>>>> = {
    agent: { avatar: serverOnly, create: serverOnly, update: serverOnly },
    attachment: { upload: reads('--path'), view: writes('--output') },
    channel: {
        add: serverOnly,
        info: serverOnly,
        join: serverOnly,
        leave: serverOnly,
        members: serverOnly,
        mute: serverOnly,
        unmute: serverOnly,
    },
    claim: {
        [bare]: serverOnly,
        assign: serverOnly,
        create: serverOnly,
        list: serverOnly,
        release: serverOnly,
        unassign: serverOnly,
        update: serverOnly,
    },
    computer: { list: serverOnly },
    connection: { grant: serverOnly, list: serverOnly, revoke: serverOnly },
    drive: {
        share: serverOnly,
        versions: serverOnly,
        view: { kind: 'workspace', nextAction: readDriveFolder },
    },
    image: { generate: reads('--reference'), models: serverOnly, wait: writes('--out') },
    inbox: { check: serverOnly },
    manual: { get: serverOnly, search: serverOnly },
    message: {
        check: serverOnly,
        follow: serverOnly,
        react: serverOnly,
        read: serverOnly,
        resolve: serverOnly,
        search: serverOnly,
        send: serverOnly,
        unfollow: serverOnly,
    },
    profile: { show: serverOnly, update: serverOnly },
    repo: { checkout: repoCheckout, list: serverOnly },
    reminder: {
        cancel: serverOnly,
        list: serverOnly,
        log: serverOnly,
        schedule: serverOnly,
        snooze: serverOnly,
        update: serverOnly,
    },
    server: { info: serverOnly },
    skill: {
        create: serverOnly,
        delete: serverOnly,
        list: serverOnly,
        patch: serverOnly,
        view: serverOnly,
        'write-file': serverOnly,
    },
    task: {
        assign: serverOnly,
        'attach-pr': serverOnly,
        list: serverOnly,
        show: serverOnly,
        start: serverOnly,
        state: serverOnly,
        unfollow: serverOnly,
        update: serverOnly,
    },
    trigger: {
        create: writes('--output'),
        delete: serverOnly,
        disable: serverOnly,
        enable: serverOnly,
        list: serverOnly,
        log: serverOnly,
        preview: reads('--payload-file'),
        rotate: writes('--output'),
        show: serverOnly,
        update: serverOnly,
    },
    worker: {
        inspect: serverOnly,
        places: serverOnly,
        send: serverOnly,
        start: serverOnly,
        stop: serverOnly,
    },
};

const topLevelHelp = new Set(['--help', '--version', '-h', '-v', 'help']);
const groupHelp = new Set(['--help', '-h']);

export function hausCommandAccess(argv: readonly string[]) {
    const [group, name] = argv;
    if (
        group === undefined ||
        topLevelHelp.has(group) ||
        name === undefined ||
        groupHelp.has(name)
    ) {
        return serverOnly satisfies HausCommandAccess;
    }
    const subcommands = Object.hasOwn(commandTable, group) ? commandTable[group] : undefined;
    const subcommand = name.startsWith('-') ? bare : name;
    const access =
        subcommands && Object.hasOwn(subcommands, subcommand) ? subcommands[subcommand] : undefined;
    if (!access) {
        return refused(
            `\`haus ${group} ${name}\` is not a haus command.`,
            'UNKNOWN_HAUS_COMMAND',
            subcommands
                ? `Run \`haus ${group} --help\` for its commands.`
                : 'Run `haus help` for the command list.'
        );
    }
    if (access.kind === 'workspace') {
        return refused(
            `\`haus ${group} ${name}\` moves files between Drive and your workspace, which \`haus\` cannot reach on its own.`,
            'HAUS_WORKSPACE_UNREACHABLE',
            access.nextAction
        );
    }
    return access satisfies HausCommandAccess;
}

function refused(message: string, code: string, nextAction: string) {
    return {
        kind: 'refused',
        text: [`Error: ${message}`, `Code: ${code}`, `Next action: ${nextAction}`].join('\n'),
    } satisfies HausCommandAccess;
}

function reads(flag: string) {
    return {
        kind: 'run',
        machineFlags: [{ direction: 'read', flag }],
    } as const satisfies CommandAccess;
}

function writes(flag: string) {
    return {
        kind: 'run',
        machineFlags: [{ direction: 'write', flag }],
    } as const satisfies CommandAccess;
}
