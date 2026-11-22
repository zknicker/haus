import Foundation

/// One command a person would recognize in a shell script. Ported from
/// `packages/haus-api/src/execution-shell-script.ts`.
struct ShellCommand: Equatable, Sendable {
    /// Its place in the script's command list.
    let position: Int
    /// Follows a `|`: an output filter of the command before it.
    let piped: Bool
    /// The program word: `npm`, `haus`, `cd`.
    let program: String
    /// The command with its leading env assignments and stderr redirects removed.
    let text: String
    /// The file a `>`/`>>` redirect writes, when it is a real file.
    let writes: String?

    /// Setup and shell syntax that never names what a script did; a redirect that writes still
    /// does (`execution-bookkeeping.ts`).
    var isSetup: Bool { writes == nil && Self.setupPrograms.contains(program) }

    static let setupPrograms: Set<String> = [
        ".", ":", "[", "[[", "{", "}", "case", "do", "done", "elif", "else", "esac", "fi", "for", "select",
        "test", "then", "cd", "echo", "exit", "export", "false", "popd", "printf", "pushd", "set", "source",
        "true", "unset",
    ]
}

/// A shell script split into commands. Heredoc bodies are skipped, continued and quoted line
/// breaks join, and unquoted `;`, `&&`, `||`, `|`, `&` separate commands. A display heuristic,
/// not a shell parser: it degrades to "the line as typed" rather than failing.
struct ShellScript: Equatable, Sendable {
    let commands: [ShellCommand]
    let hasHeredoc: Bool
    /// Logical lines outside heredoc bodies.
    let lines: Int

    static func parse(_ script: String) -> ShellScript {
        var commands: [ShellCommand] = []
        var lines = 0
        var hasHeredoc = false
        for line in ShellScriptLines.logical(script) {
            hasHeredoc = hasHeredoc || ShellPatterns.heredocOpener.contains(line)
            let text = ShellPatterns.heredocOpener.replacing(in: line).traceTrimmed
            guard !text.isEmpty else { continue }
            lines += 1
            for segment in ShellScriptLines.segments(text) {
                if let command = readCommand(segment.text, piped: segment.piped, position: commands.count) {
                    commands.append(command)
                }
            }
        }
        return ShellScript(commands: commands, hasHeredoc: hasHeredoc, lines: lines)
    }

    /// `/bin/zsh -lc "…"` → `…`: a runtime's own wrapper is not what the Agent ran. Only `-c`
    /// means "the rest is the script"; without it the argument is a file to run.
    static func unwrap(_ command: String) -> String {
        guard let match = ShellPatterns.shellWrapper.firstMatch(in: command.traceTrimmed),
              let flags = match[1], flags.contains("c"),
              let script = match[2]
        else { return command }
        return readQuoted(script.traceTrimmed)
    }

    private static func readCommand(_ segment: String, piped: Bool, position: Int) -> ShellCommand? {
        let unwrapped = ShellPatterns.closingParens.replacing(
            in: ShellPatterns.openingParens.replacing(in: segment.traceTrimmed)
        ).traceTrimmed
        let stripped = ShellPatterns.envAssignment.replacing(in: ShellPatterns.controlPrefix.replacing(in: unwrapped))
        let text = ShellPatterns.stderrRedirect.replacing(in: stripped).traceTrimmed
        guard !text.isEmpty else { return nil }
        let target = readWriteTarget(text)
        let firstWord = text.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
        let programWord = ShellPatterns.edgeQuote.replacing(in: firstWord)
        return ShellCommand(
            position: position,
            piped: piped,
            program: programWord.components(separatedBy: "/").last ?? programWord,
            text: ShellPatterns.whitespaceRun.replacing(in: text, with: " "),
            writes: target.flatMap { $0 == "/dev/null" ? nil : $0 }
        )
    }

    /// Quoted text is masked first (same length), so a `>` inside quoted code is not a redirect,
    /// while a quoted target still reads from the original.
    private static func readWriteTarget(_ text: String) -> String? {
        let masked = NSMutableString(string: text)
        for match in ShellPatterns.quotedString.matches(in: text) where match.range.length >= 2 {
            let source = (text as NSString).substring(with: match.range) as NSString
            let open = source.substring(to: 1)
            let close = source.substring(from: source.length - 1)
            let fill = String(repeating: "_", count: match.range.length - 2)
            masked.replaceCharacters(in: match.range, with: open + fill + close)
        }
        guard let match = ShellPatterns.writeRedirect.firstMatch(in: masked as String),
              match.groupRanges.count > 1, match.groupRanges[1].location != NSNotFound
        else { return nil }
        let target = (text as NSString).substring(with: match.groupRanges[1])
        return ShellPatterns.edgeQuote.replacing(in: target)
    }

    private static func readQuoted(_ value: String) -> String {
        let quote: String? = value.hasPrefix("\"") ? "\"" : value.hasPrefix("'") ? "'" : nil
        guard let quote else { return value }
        var inner = String(value.dropFirst())
        if value.count > 1, value.hasSuffix(quote) { inner = String(inner.dropLast()) }
        return quote == "\""
            ? ShellPatterns.doubleQuoteEscape.replacing(in: inner, with: "$1")
            : inner.replacingOccurrences(of: "'\\''", with: "'")
    }
}

enum ShellPatterns {
    /// Only an opener that ends its line (or precedes a redirect or pipe) starts a document.
    static let heredocOpener = TraceRegex(#"<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1(?=\s*(?:[|;&>].*)?$)"#)
    static let stderrRedirect = TraceRegex(#"\s*\d?>&\d|\s*\d>\s*/dev/null"#)
    static let writeRedirect = TraceRegex(#"(?:^|\s)\d?>>?\s*(?!&)("[^"]*"|'[^']*'|[^\s;|&<>]+)"#)
    static let quotedString = TraceRegex(#"'[^']*'|"(?:\\.|[^"\\])*""#)
    static let envAssignment = TraceRegex(#"^(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+"#)
    /// `if`/`then`/`while` lead the command they guard; the command is what ran.
    static let controlPrefix = TraceRegex(#"^(?:(?:if|then|else|elif|do|while|until|!)\s+)+"#)
    static let shellWrapper = TraceRegex(#"^(?:\S*/)?(?:sh|bash|zsh|dash|ksh)\s+(-[a-z]+)\s+([\s\S]+)$"#)
    static let doubleQuoteEscape = TraceRegex(#"\\(["$\\`])"#)
    static let openingParens = TraceRegex(#"^\(+"#)
    static let closingParens = TraceRegex(#"\)+$"#)
    static let edgeQuote = TraceRegex(#"^['"]|['"]$"#)
    static let whitespaceRun = TraceRegex(#"\s+"#)
}
