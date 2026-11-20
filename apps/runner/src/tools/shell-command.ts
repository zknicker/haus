export function shellCommandOf(argv: readonly string[]) {
    const command = argv.map(quoteWord).join(' ');
    return { command, script: wrappedScript(argv) ?? command };
}

export function quoteWord(word: string) {
    return plainWord.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

function wrappedScript(argv: readonly string[]) {
    const [program = '', ...args] = argv;
    if (!shellPrograms.test(program)) {
        return null;
    }
    for (const [index, arg] of args.entries()) {
        if (!shortFlags.test(arg)) {
            return null;
        }
        if (arg.includes('c')) {
            return args[index + 1] ?? null;
        }
    }
    return null;
}

const plainWord = /^[\w@%+=:,./-]+$/u;
const shellPrograms = /^(?:\S*\/)?(?:bash|sh|zsh)$/u;
const shortFlags = /^-[A-Za-z]+$/u;
