export interface CodeLanguage {
    id: string;
    label: string;
}

const plainText: CodeLanguage = { id: 'text', label: 'Text' };

/** Shiki language for a workspace file, by file name then extension; plain text otherwise. */
export function codeLanguageForPath(path: string): CodeLanguage {
    const name = path.split('/').at(-1)?.toLowerCase() ?? '';
    const byName = languageByFileName[name] ?? (name.startsWith('.env') ? dotenv : undefined);
    if (byName) {
        return byName;
    }
    const dot = name.lastIndexOf('.');
    if (dot <= 0) {
        return plainText;
    }
    return languageByExtension[name.slice(dot + 1)] ?? plainText;
}

/**
 * Shiki language for a Markdown fence's info string (`ts`, `python`, `bash`):
 * by extension, language name, or Shiki id; plain text when it names none. An
 * unknown name passes through, and CodeBlock paints it unhighlighted.
 */
export function codeLanguageForFence(info: string | undefined): CodeLanguage {
    const name = info?.trim().toLowerCase();
    if (!name) {
        return plainText;
    }
    return languageByFenceName[name] ?? { id: name, label: name };
}

/**
 * Largest file a code view tokenizes. Shiki runs on the main thread and emits a
 * span per token, so past this a (server-truncated, up to 512 KB) file renders
 * as plain text instead of stalling the pane.
 */
export const maxHighlightedCodeLength = 100_000;

/** Shiki language a code view highlights `content` with: by path, plain text when too large. */
export function codeHighlightLanguage(path: string, content: string): string {
    return content.length > maxHighlightedCodeLength ? plainText.id : codeLanguageForPath(path).id;
}

/**
 * Lines a code view shows for `content`: one per newline-separated line, where
 * a final trailing newline ends the last line rather than opening an empty one
 * (a `<pre>` renders it that way, so the gutter must count it that way).
 */
export function countCodeLines(content: string): number {
    const lines = content.split('\n').length;
    return content.endsWith('\n') ? lines - 1 : lines;
}

const dotenv: CodeLanguage = { id: 'dotenv', label: 'Env' };

const languageByFileName: Record<string, CodeLanguage> = {
    dockerfile: { id: 'docker', label: 'Dockerfile' },
    gnumakefile: { id: 'makefile', label: 'Makefile' },
    makefile: { id: 'makefile', label: 'Makefile' },
};

const languages = {
    c: { id: 'c', label: 'C' },
    cpp: { id: 'cpp', label: 'C++' },
    css: { id: 'css', label: 'CSS' },
    diff: { id: 'diff', label: 'Diff' },
    go: { id: 'go', label: 'Go' },
    graphql: { id: 'graphql', label: 'GraphQL' },
    html: { id: 'html', label: 'HTML' },
    ini: { id: 'ini', label: 'INI' },
    java: { id: 'java', label: 'Java' },
    javascript: { id: 'javascript', label: 'JavaScript' },
    json: { id: 'json', label: 'JSON' },
    kotlin: { id: 'kotlin', label: 'Kotlin' },
    lua: { id: 'lua', label: 'Lua' },
    markdown: { id: 'markdown', label: 'Markdown' },
    php: { id: 'php', label: 'PHP' },
    python: { id: 'python', label: 'Python' },
    ruby: { id: 'ruby', label: 'Ruby' },
    rust: { id: 'rust', label: 'Rust' },
    scss: { id: 'scss', label: 'SCSS' },
    shell: { id: 'shellscript', label: 'Shell' },
    sql: { id: 'sql', label: 'SQL' },
    swift: { id: 'swift', label: 'Swift' },
    toml: { id: 'toml', label: 'TOML' },
    tsx: { id: 'tsx', label: 'TSX' },
    typescript: { id: 'typescript', label: 'TypeScript' },
    xml: { id: 'xml', label: 'XML' },
    yaml: { id: 'yaml', label: 'YAML' },
} satisfies Record<string, CodeLanguage>;

const languageByExtension: Record<string, CodeLanguage> = {
    bash: languages.shell,
    c: languages.c,
    cc: languages.cpp,
    cfg: languages.ini,
    cjs: languages.javascript,
    conf: languages.ini,
    cpp: languages.cpp,
    css: languages.css,
    cts: languages.typescript,
    diff: languages.diff,
    go: languages.go,
    gql: languages.graphql,
    graphql: languages.graphql,
    h: languages.c,
    hpp: languages.cpp,
    htm: languages.html,
    html: languages.html,
    ini: languages.ini,
    java: languages.java,
    js: languages.javascript,
    json: languages.json,
    jsonc: languages.json,
    jsonl: languages.json,
    jsx: languages.tsx,
    kt: languages.kotlin,
    kts: languages.kotlin,
    lua: languages.lua,
    md: languages.markdown,
    mdx: languages.markdown,
    mjs: languages.javascript,
    mts: languages.typescript,
    patch: languages.diff,
    php: languages.php,
    py: languages.python,
    rb: languages.ruby,
    rs: languages.rust,
    scss: languages.scss,
    sh: languages.shell,
    sql: languages.sql,
    svg: languages.xml,
    swift: languages.swift,
    toml: languages.toml,
    ts: languages.typescript,
    tsx: languages.tsx,
    xml: languages.xml,
    yaml: languages.yaml,
    yml: languages.yaml,
    zsh: languages.shell,
};

const languageByFenceName: Record<string, CodeLanguage> = {
    ...Object.fromEntries(Object.values(languages).map((language) => [language.id, language])),
    ...languages,
    ...languageByExtension,
    plaintext: plainText,
    text: plainText,
    txt: plainText,
};
