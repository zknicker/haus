import Foundation

/// The one-line name for a shell call. Ported from the App's `turn-trace-shell-label.ts`.
///
/// A runtime's own wrapper and a heredoc's document are not what the Agent did. A one-line command
/// reads as typed; a compound script reads as its most meaningful command, with setup and `haus`
/// bookkeeping skipped.
struct ShellLabel: Equatable, Sendable {
    /// A muted line beside the label: a stdin script's first meaningful line.
    let detail: String?
    /// Other meaningful commands the label does not name.
    let extraCommands: Int
    /// Logical script lines outside heredoc bodies.
    let lines: Int
    let label: TraceLabel

    var past: String { label.past }
    var present: String { label.present }

    static func format(_ command: String, tense: TraceTense = .past) -> String {
        read(command).label[tense]
    }

    static func read(_ command: String) -> ShellLabel {
        let script = ShellScript.parse(ShellScript.unwrap(command))
        let heads = script.commands.filter { !$0.piped }
        let meaningful = heads.filter { !$0.isSetup }
        let haus = meaningful.filter { $0.program == "haus" }
        func label(_ label: TraceLabel, extra: Int = 0, detail: String? = nil) -> ShellLabel {
            ShellLabel(detail: detail, extraCommands: extra, lines: script.lines, label: label)
        }

        guard let head = heads.first else { return label(TraceLabel("Ran a command", "Running a command")) }
        if !haus.isEmpty, haus.count == meaningful.count {
            let read = hausLabel(haus)
            return label(read.label, extra: read.extra)
        }
        if script.hasHeredoc, let stdin = meaningful.first(where: { stdinLanguage($0) != nil }) {
            let language = stdinLanguage(stdin) ?? "a script"
            let others = meaningful.filter { $0.position != stdin.position && $0.program != "haus" }
            return label(
                TraceLabel("Ran \(language)", "Running \(language)"),
                extra: others.count,
                detail: heredocLine(command, program: stdin.program)
            )
        }
        if script.lines == 1, !script.hasHeredoc, haus.isEmpty, !head.isSetup,
           !ShellLabelPatterns.controlLead.contains(firstLine(command)) {
            if let idiom = ShellLabelCompound.idiom(script.commands, head: head) { return label(idiom) }
            let typed = clamp(script.commands.count == 1 ? head.text : firstLine(command))
            return label(TraceLabel("Ran \(typed)", "Running \(typed)"))
        }
        let read = ShellLabelCompound.label(
            meaningful.filter { $0.program != "haus" },
            describe: { ShellLabelCompound.idiom(script.commands, head: $0) }
        )
        return label(read.label, extra: read.extra)
    }

    static func clamp(_ summary: String) -> String {
        summary.count > maxChars ? "\(String(summary.prefix(maxChars - 1)).traceTrimmedEnd)…" : summary
    }

    private static let maxChars = 80

    private static func hausLabel(_ commands: [ShellCommand]) -> (label: TraceLabel, extra: Int) {
        let extra = commands.count - 1
        let spoken = commands.filter { !isHelp($0) }
        guard let first = spoken.first else { return (TraceLabel("Read haus help", "Reading haus help"), extra) }
        if let verb = HausCommandVerb.read(first.text) { return (verb, extra) }
        let typed = clamp(first.text)
        return (TraceLabel("Ran \(typed)", "Running \(typed)"), extra)
    }

    /// `a Python script` when a command runs an interpreter on its stdin; nil otherwise.
    private static func stdinLanguage(_ command: ShellCommand) -> String? {
        let program = ShellLabelPatterns.versionSuffix.replacing(in: command.program)
        guard let language = interpreterLanguages[program] else { return nil }
        let args = command.text.traceWords.dropFirst()
        return args.allSatisfy { $0.hasPrefix("-") } ? language : nil
    }

    private static let interpreterLanguages = [
        "bash": "a shell script",
        "node": "a Node script",
        "perl": "a Perl script",
        "php": "a PHP script",
        "python": "a Python script",
        "ruby": "a Ruby script",
        "sh": "a shell script",
        "zsh": "a shell script",
    ]

    /// The heredoc's first line that does something: no blank, comment, or import line.
    private static func heredocLine(_ command: String, program: String) -> String? {
        let lines = ShellScript.unwrap(command).traceLines
        guard let opener = lines.firstIndex(where: {
            $0.contains(program) && ShellLabelPatterns.heredocStart.contains($0)
        }) else { return nil }
        let line = lines[(opener + 1)...]
            .map(\.traceTrimmed)
            .first { !$0.isEmpty && !ShellLabelPatterns.scriptPreamble.contains($0) }
        return line.map(clamp)
    }

    private static func isHelp(_ command: ShellCommand) -> Bool {
        let words = command.text.traceWords
        return words.contains("--help") || words.contains("-h") || (words.count > 1 && words[1] == "help")
    }

    private static func firstLine(_ command: String) -> String {
        let line = ShellScript.unwrap(command).traceLines.first { !$0.traceTrimmed.isEmpty } ?? ""
        return ShellPatterns.whitespaceRun.replacing(in: line, with: " ").traceTrimmed
    }
}

enum ShellLabelPatterns {
    /// A line that opens with shell syntax reads as the command inside it, never as typed.
    static let controlLead = TraceRegex(#"^(?:if|while|until|for|case|select|!)\s"#)
    static let versionSuffix = TraceRegex(#"[\d.]+$"#)
    static let heredocStart = TraceRegex(#"<<-?\s*['"]?[A-Za-z_]"#)
    static let scriptPreamble = TraceRegex(
        #"^(?:#|//|import\s|from\s+\S+\s+import\s|['"]use strict['"]|(?:const|let|var)\s+\w+\s*=\s*require\(|require\s|use\s+(?:strict|warnings)\b)"#
    )
    static let runnerCommand = TraceRegex(
        #"^(?:(?:npm|pnpm|yarn|bun)\s+(?:test|run|build|install|ci|x)\b|(?:npx|bunx|pytest|vitest|jest|tsc|cargo|go|make|gradle|mvn|swift|xcodebuild|uv|deno)\b)"#
    )
    static let lineCount = TraceRegex(#"^wc\s+-l$"#)
}
