export function shellCommandOf(argv: readonly string[]) {
    const command = argv.map(quoteWord).join(' ');
    const [program = '', flag = '', script, ...rest] = argv;
    const wrapped =
        script !== undefined &&
        rest.length === 0 &&
        shellPrograms.test(program) &&
        commandFlags.test(flag);
    return { command, script: wrapped ? script : command };
}

export function quoteWord(word: string) {
    return plainWord.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

const plainWord = /^[\w@%+=:,./-]+$/u;
const shellPrograms = /^(?:\S*\/)?(?:bash|sh|zsh)$/u;
const commandFlags = /^-(?:c|lc|cl)$/u;
