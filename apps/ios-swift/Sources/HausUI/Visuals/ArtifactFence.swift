import Foundation

/// One ```artifact fence: a self-contained HTML page in the authoring Agent's
/// workspace, drawn in the transcript as a compact card.
public struct ArtifactSegment: Sendable, Hashable, Identifiable {
    public let ordinal: Int
    /// Workspace-relative, already validated to stay inside the workspace.
    public let path: String
    public let title: String?

    public var id: Int { ordinal }

    public init(ordinal: Int, path: String, title: String?) {
        self.ordinal = ordinal
        self.path = path
        self.title = title
    }

    /// The page's file name, the label when the Agent gave no title.
    public var fileName: String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    public var displayTitle: String { title ?? fileName }
}

/// The ```artifact fence grammar, ported from the App's `splitArtifactFences`
/// and the shared `widgetArtifactPropsSchema`.
///
/// The opener reads mid-line, so a model that glues it to the end of a sentence
/// still gets a card, and the terminator closes whether it stands on its own
/// line or is glued to the end of the JSON. Only a payload the shared schema
/// accepts becomes a card; anything else stays message text, as on the web.
public enum ArtifactFence {
    /// The message with every valid fence cut out, and the fences in order.
    public static func extract(_ content: String) -> (text: String, artifacts: [ArtifactSegment]) {
        var text = ""
        var artifacts: [ArtifactSegment] = []
        for piece in pieces(content) {
            switch piece {
            case .text(let run): text += run
            case .artifact(let path, let title):
                artifacts.append(ArtifactSegment(ordinal: artifacts.count + 1, path: path, title: title))
            }
        }
        return (text, artifacts)
    }

    /// The message with every valid fence replaced by its fallback text, so a
    /// one-line preview reads the page's name instead of its JSON.
    public static func previewText(_ content: String) -> String {
        pieces(content).map { piece in
            switch piece {
            case .text(let run): run
            case .artifact(let path, let title):
                fallbackText(ArtifactSegment(ordinal: 0, path: path, title: title))
            }
        }.joined()
    }

    private enum Piece {
        case text(String)
        case artifact(path: String, title: String?)
    }

    /// The message in written order: the text around each valid fence, and
    /// the fence. An invalid fence stays inside the text around it.
    private static func pieces(_ content: String) -> [Piece] {
        guard content.contains(opener), let expression else { return [.text(content)] }
        let source = content as NSString
        var pieces: [Piece] = []
        var cursor = 0
        for match in expression.matches(in: content, range: NSRange(location: 0, length: source.length)) {
            guard let props = props(source.substring(with: match.range(at: 1))) else { continue }
            let before = NSRange(location: cursor, length: match.range.location - cursor)
            pieces.append(.text(source.substring(with: before)))
            pieces.append(.artifact(path: props.path, title: props.title))
            cursor = match.range.location + match.range.length
        }
        pieces.append(.text(source.substring(from: cursor)))
        return pieces
    }

    private static let opener = "```artifact"

    /// The fallback a preview line reads where the fence was: the title, else
    /// `Artifact: <path>` — the shared `widgetFallbackText`.
    public static func fallbackText(_ artifact: ArtifactSegment) -> String {
        String((artifact.title ?? "Artifact: \(artifact.path)").prefix(500))
    }

    /// `widgetArtifactPropsSchema`: a strict object with a confined
    /// workspace-relative `.html`/`.htm` path and an optional short title.
    static func props(_ json: String) -> (path: String, title: String?)? {
        guard let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys).isSubset(of: ["path", "title"]),
              let rawPath = object["path"] as? String
        else { return nil }
        let path = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isWorkspacePagePath(path) else { return nil }

        var title: String?
        if let rawTitle = object["title"] {
            guard let string = rawTitle as? String else { return nil }
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...120).contains(trimmed.count) else { return nil }
            title = trimmed
        }
        return (path, title)
    }

    /// `workspaceFilePathSchema` for an HTML page. Shape only: the Computer's
    /// read is what actually confines the path to the workspace.
    static func isWorkspacePagePath(_ path: String) -> Bool {
        guard (1...512).contains(path.count),
              !path.hasPrefix("/"),
              !path.contains("\\"),
              path.split(separator: "/", omittingEmptySubsequences: false)
                  .allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." })
        else { return false }
        let lowered = path.lowercased()
        return lowered.hasSuffix(".html") || lowered.hasSuffix(".htm")
    }

    private static let expression = try? NSRegularExpression(
        pattern: #"```artifact[^\S\r\n]*\r?\n([\s\S]*?)\r?\n?[ \t]*```"#
    )
}
