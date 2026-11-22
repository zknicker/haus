import Foundation
import HausModels

/// The row label for one journal tool call, in both tenses. Ported from the App's
/// `turn-trace-tool-label.ts` and `execution-tool-kind.ts`; a path target is the file's basename.
enum TraceToolLabel {
    static func label(toolName: String, input: JSONValue?) -> TraceLabel {
        let fields = TraceToolFields(input: input)
        let file = fields.path.map(TracePath.basename)
        switch kind(toolName) {
        case .compaction: return .verb("Compacted", "Compacting", "the context")
        case .fileChange: return .verb("Changed", "Changing", file ?? "a file")
        case .fileEdit: return .verb("Edited", "Editing", file ?? "a file")
        case .fileRead: return .verb("Read", "Reading", file ?? "a file")
        case .fileWrite: return .verb("Wrote", "Writing", file ?? "a file")
        case .image: return .verb("Generated", "Generating", "an image")
        case .mcp: return .verb("Called", "Calling", toolName.replacingOccurrences(of: "mcp__", with: ""))
        case .message: return .verb("Sent", "Sending", "a message")
        case .search: return .verb("Searched", "Searching", fields.pattern ?? file ?? "the workspace")
        case .shell: return fields.command.map { ShellLabel.read($0).label } ?? .verb("Ran", "Running", "a command")
        case .web:
            if let host = fields.url.flatMap({ URL(string: $0)?.host() }) { return .verb("Fetched", "Fetching", host) }
            return fields.query.map { .verb("Searched", "Searching", "the web for \($0)") } ?? .verb("Used", "Using", "the web")
        case .subagent, .generic: return .verb("Used", "Using", toolName)
        }
    }

    /// A journal tool's kind from its wire name, case- and padding-insensitive.
    static func kind(_ toolName: String) -> ExecutionToolKind {
        let normalized = toolName.traceTrimmed.lowercased()
        if normalized.hasPrefix("mcp__") { return .mcp }
        return kindsByName[normalized] ?? .generic
    }

    private static let kindsByName: [String: ExecutionToolKind] = [
        "bash": .shell, "browser": .web, "command": .shell, "compaction": .compaction, "filechange": .fileChange,
        "edit": .fileEdit, "exec": .shell, "glob": .search, "grep": .search, "image_edit": .image,
        "image_gen": .image, "image_to_video": .image, "message": .message, "multiedit": .fileEdit,
        "read": .fileRead, "reference_to_video": .image, "send_message": .message, "shell": .shell,
        "terminal": .shell, "web_fetch": .web, "web_search": .web, "webfetch": .web, "websearch": .web,
        "write": .fileWrite, "zsh": .shell,
    ]
}

/// The input fields a label reads.
struct TraceToolFields: Equatable, Sendable {
    let command: String?
    let path: String?
    let pattern: String?
    let query: String?
    let url: String?

    init(input: JSONValue?) {
        let object: [String: JSONValue] = if case .object(let fields) = input { fields } else { [:] }
        func string(_ key: String) -> String? {
            if case .string(let value) = object[key], !value.isEmpty { value } else { nil }
        }
        command = string("command") ?? string("cmd") ?? Self.argvCommand(object["command"])
        path = string("file_path") ?? string("path") ?? string("filePath")
        pattern = string("pattern") ?? string("glob")
        query = string("query")
        url = string("url")
    }

    /// `["bash", "-lc", "…"]` runs the script; any other argv is the program itself.
    private static func argvCommand(_ value: JSONValue?) -> String? {
        guard case .array(let parts) = value else { return nil }
        let words = parts.compactMap { part in if case .string(let word) = part { word } else { nil } }
        guard words.count == parts.count, !words.isEmpty else { return nil }
        let isShell = ShellToolPatterns.shell.contains(words[0])
        return words.count == 3 && isShell && words[1].contains("c") ? words[2] : words.joined(separator: " ")
    }
}

private enum ShellToolPatterns {
    static let shell = TraceRegex(#"^(?:\S*/)?(?:sh|bash|zsh|dash|ksh)$"#)
}
