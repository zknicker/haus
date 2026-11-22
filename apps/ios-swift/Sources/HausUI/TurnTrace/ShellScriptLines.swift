import Foundation

/// The line and command splitting under `ShellScript`.
enum ShellScriptLines {
    struct Segment: Equatable {
        let piped: Bool
        let text: String
    }

    /// Lines outside heredoc bodies, with `\`-continued lines and quoted line breaks joined.
    static func logical(_ script: String) -> [String] {
        var result: [String] = []
        var pending: [String] = []
        var current = ""
        for line in script.traceLines {
            if let terminator = pending.first {
                if line.traceTrimmed == terminator { pending.removeFirst() }
                continue
            }
            if isInsideQuote(current + line) {
                current += "\(line)\n"
                continue
            }
            if line.hasSuffix("\\") {
                current += "\(line.dropLast()) "
                continue
            }
            let logical = current + line
            current = ""
            result.append(logical)
            pending = ShellPatterns.heredocOpener.matches(in: logical).map { $0[2] ?? "" }
        }
        if !current.isEmpty { result.append(current) }
        return result
    }

    /// The commands on one logical line, split at unquoted operators.
    static func segments(_ line: String) -> [Segment] {
        let chars = Array(line)
        var segments: [Segment] = []
        var quote: Character?
        var start = 0
        var piped = false
        var index = 0
        while index < chars.count {
            let char = chars[index]
            if char == "\\", quote != "'" {
                index += 2
                continue
            }
            if let open = quote {
                if char == open { quote = nil }
                index += 1
                continue
            }
            if char == "\"" || char == "'" {
                quote = char
                index += 1
                continue
            }
            if let operation = readOperator(chars, at: index) {
                segments.append(Segment(piped: piped, text: String(chars[start..<index])))
                piped = operation.pipes
                index += operation.length - 1
                start = index + 1
            }
            index += 1
        }
        segments.append(Segment(piped: piped, text: String(chars[min(start, chars.count)...])))
        return segments
    }

    /// Whether `text` ends inside an unclosed quote, so its line break belongs to a word.
    static func isInsideQuote(_ text: String) -> Bool {
        let chars = Array(text)
        var quote: Character?
        var index = 0
        while index < chars.count {
            let char = chars[index]
            if char == "\\", quote != "'" {
                index += 1
            } else if let open = quote {
                if char == open { quote = nil }
            } else if char == "\"" || char == "'" {
                quote = char
            } else if char == "#", index == 0 || chars[index - 1].isWhitespace {
                index = chars[index...].firstIndex(of: "\n") ?? chars.count
            }
            index += 1
        }
        return quote != nil
    }

    /// An unquoted `;`, `&&`, `||`, `|`, or background `&`; `2>&1` and `&>` are redirections.
    private static func readOperator(_ chars: [Character], at index: Int) -> (length: Int, pipes: Bool)? {
        let char = chars[index]
        if char == ";" { return (1, false) }
        guard char == "|" || char == "&" else { return nil }
        let previous = index > 0 ? chars[index - 1] : nil
        let next = index + 1 < chars.count ? chars[index + 1] : nil
        if char == "&", previous == ">" || previous == "<" || next == ">" { return nil }
        let doubled = next == char
        return (doubled ? 2 : 1, char == "|" && !doubled)
    }
}
