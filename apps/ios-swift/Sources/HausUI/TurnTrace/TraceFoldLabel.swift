import Foundation
import HausModels

/// One call in a folded run: what the fold label reads of it.
struct TraceFoldMember: Equatable, Sendable {
    enum Media: Sendable { case image, video }

    let label: TraceLabel
    let path: String?
    var media: Media?
}

/// Labels for runs of same-kind calls. Ported from the App's `turn-trace-fold-label.ts`.
enum TraceFoldLabel {
    /// `Read 3 files`, `Ran 5 commands`, or — when every member reads the same — that label `×5`.
    static func label(_ kind: ExecutionToolKind, members: [TraceFoldMember]) -> TraceLabel {
        let count = members.count
        if let first = members.first, members.allSatisfy({ $0.label.past == first.label.past && $0.path == first.path }) {
            return TraceLabel("\(first.label.past) ×\(count)", "\(first.label.present) ×\(count)")
        }
        let verbs = foldVerbs[kind] ?? genericVerbs
        let noun = kind == .image ? mediaNoun(members) : verbs.noun
        return TraceLabel("\(verbs.past) \(count) \(noun)", "\(verbs.present) \(count) \(noun)")
    }

    /// A settled turn's operation count, as its summary row reads: `Read 3 files`, `Ran 1 command`.
    static func label(_ operation: AgentTurnOperationCount) -> String {
        let count = operation.completed + operation.failed + operation.interrupted
        let (verb, one, many) = operationVerbs[operation.category] ?? ("Used", "tool", "tools")
        return "\(verb) \(count) \(count == 1 ? one : many)"
    }

    private typealias Verbs = (past: String, present: String, noun: String)

    private static let genericVerbs: Verbs = ("Used", "Using", "tools")

    private static let foldVerbs: [ExecutionToolKind: Verbs] = [
        .fileChange: ("Changed", "Changing", "files"),
        .fileEdit: ("Edited", "Editing", "files"),
        .fileRead: ("Read", "Reading", "files"),
        .fileWrite: ("Wrote", "Writing", "files"),
        .image: ("Generated", "Generating", "images"),
        .mcp: ("Made", "Making", "tool calls"),
        .message: ("Sent", "Sending", "messages"),
        .search: ("Ran", "Running", "searches"),
        .shell: ("Ran", "Running", "commands"),
        .web: ("Made", "Making", "web requests"),
    ]

    private static let operationVerbs: [AgentTurnOperationCategory: (String, String, String)] = [
        .browsing: ("Opened", "page", "pages"),
        .checkingMessages: ("Checked messages", "time", "times"),
        .delegating: ("Ran", "sub-agent", "sub-agents"),
        .editingFiles: ("Edited", "file", "files"),
        .generatingImage: ("Generated", "image", "images"),
        .generatingVideo: ("Generated", "video", "videos"),
        .readingFiles: ("Read", "file", "files"),
        .runningCommand: ("Ran", "command", "commands"),
        .searchingWeb: ("Ran", "web search", "web searches"),
        .updatingInstructions: ("Updated instructions", "time", "times"),
        .usingTool: ("Used", "tool", "tools"),
    ]

    /// A media fold names what it made: `images`, `videos`, or both.
    private static func mediaNoun(_ members: [TraceFoldMember]) -> String {
        let videos = members.filter { $0.media == .video }.count
        if videos == 0 { return "images" }
        return videos == members.count ? "videos" : "images and videos"
    }
}
