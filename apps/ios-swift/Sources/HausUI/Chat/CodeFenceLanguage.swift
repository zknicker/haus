import Foundation

/// The label a fenced code block's header names its language by.
///
/// Mirrors the App's `codeLanguageForFence` (`apps/website/src/lib/code-language.ts`):
/// the info string's first word, matched by extension, language name, or
/// Shiki id; plain text when the fence names none; an unknown word passes
/// through as written. The header uppercases whatever this returns.
enum CodeFenceLanguage {
    static func label(forFence info: String?) -> String {
        guard let word = info?
            .split(whereSeparator: \.isWhitespace)
            .first?
            .lowercased(), !word.isEmpty
        else { return plainText }
        return labels[word] ?? word
    }

    static let plainText = "Text"

    private static let labels: [String: String] = [
        "bash": "Shell", "c": "C", "cc": "C++", "cfg": "INI", "cjs": "JavaScript",
        "conf": "INI", "cpp": "C++", "css": "CSS", "cts": "TypeScript", "diff": "Diff",
        "go": "Go", "gql": "GraphQL", "graphql": "GraphQL", "h": "C", "hpp": "C++",
        "htm": "HTML", "html": "HTML", "ini": "INI", "java": "Java",
        "javascript": "JavaScript", "js": "JavaScript", "json": "JSON", "jsonc": "JSON",
        "jsonl": "JSON", "jsx": "TSX", "kotlin": "Kotlin", "kt": "Kotlin", "kts": "Kotlin",
        "lua": "Lua", "markdown": "Markdown", "md": "Markdown", "mdx": "Markdown",
        "mjs": "JavaScript", "mts": "TypeScript", "patch": "Diff", "php": "PHP",
        "plaintext": plainText, "py": "Python", "python": "Python", "rb": "Ruby",
        "ruby": "Ruby", "rs": "Rust", "rust": "Rust", "scss": "SCSS", "sh": "Shell",
        "shell": "Shell", "shellscript": "Shell", "sql": "SQL", "svg": "XML",
        "swift": "Swift", "text": plainText, "toml": "TOML", "ts": "TypeScript",
        "tsx": "TSX", "txt": plainText, "typescript": "TypeScript", "xml": "XML",
        "yaml": "YAML", "yml": "YAML", "zsh": "Shell",
    ]
}
