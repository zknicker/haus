import Foundation

/// Filename-first path display. An absolute path inside an Agent workspace loses everything up to
/// the workspace (and one in the Agent's home reads `~/…`), so a host's username and ids never lead
/// a row. Ported from the App's `turn-trace-path.ts`.
struct TracePath: Equatable, Sendable {
    /// The directory, workspace-relative when it can be; empty at the root.
    let dir: String
    /// The basename.
    let name: String
    /// The full display path.
    let path: String

    init(_ raw: String) {
        let path = Self.relativize(raw.traceTrimmed)
        let trimmed = Self.trailingSlashes.replacing(in: path)
        self.path = path
        if let slash = trimmed.lastIndex(of: "/") {
            let directory = String(trimmed[..<slash])
            dir = directory.isEmpty ? "/" : directory
            name = String(trimmed[trimmed.index(after: slash)...])
        } else {
            dir = ""
            name = trimmed
        }
    }

    static func basename(_ path: String) -> String {
        TracePath(path).name
    }

    static func relativize(_ path: String) -> String {
        let relative = workspacePrefix.replacing(in: path)
        if relative != path { return relative.isEmpty ? "<workspace>" : relative }
        return homePrefix.replacing(in: path, with: "~")
    }

    private static let trailingSlashes = TraceRegex(#"/+$"#)
    private static let workspacePrefix = TraceRegex(#"^/(?:[^/]+/)*agents/[^/]+/workspace(?:/|$)"#)
    private static let homePrefix = TraceRegex(#"^/(?:[^/]+/)*agents/[^/]+/home(?=/|$)"#)
}
