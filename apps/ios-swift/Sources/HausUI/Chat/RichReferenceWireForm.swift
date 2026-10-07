import Foundation

/// One reference read out of its Markdown target: what it points at, the
/// identity it points at it by, and — for the two kinds whose label the target
/// itself dictates — that label.
public struct RichReferenceTarget: Hashable, Sendable {
    public let kind: MentionPresentationKind
    public let id: String
    /// The label the target itself fixes, ignoring the link text: a pull
    /// request reads as `#<n>` and a bare URL as its host. Nil everywhere else,
    /// where the link text is the label.
    public let label: String?
}

/// Every wire form a rich reference can arrive in.
///
/// This is the phone's half of `packages/haus-api/src/rich-references.ts` and
/// the App's `reference-markdown.tsx`, in the App's own order: the typed
/// schemes first, then a leading-`/` path, then an ordinary web link — a GitHub
/// pull request if the URL names one, an ordinary site otherwise. A target that
/// matches nothing is not a reference, and its Markdown stays as written.
public enum RichReferenceWireForm {
    public static func read(target rawTarget: String, text: String) -> RichReferenceTarget? {
        let target = rawTarget.trimmingCharacters(in: .whitespaces)

        if let id = schemeID(target, scheme: "agent") {
            return RichReferenceTarget(kind: .agent, id: id, label: nil)
        }
        if let id = schemeID(target, scheme: "user") {
            return RichReferenceTarget(kind: .human, id: id, label: nil)
        }
        // A Thread rides the Chat scheme with its anchor in the query, so it is
        // read first; any other query makes the target no reference at all.
        if ThreadReferenceTarget(wireTarget: target) != nil {
            return RichReferenceTarget(kind: .thread, id: target, label: nil)
        }
        if !target.contains("?"), let id = schemeID(target, scheme: "chat") {
            return RichReferenceTarget(kind: .channel, id: id, label: nil)
        }
        // The App accepts a bare `plugin://` where every other scheme needs an
        // identity after it, so the prefix alone is the whole test.
        if target.hasPrefix(pluginPrefix) {
            return RichReferenceTarget(
                kind: .plugin,
                id: decoded(String(target.dropFirst(pluginPrefix.count))),
                label: nil
            )
        }
        if target.hasPrefix(appPrefix) {
            let id = decoded(String(target.dropFirst(appPrefix.count)))
            return id.isEmpty ? nil : RichReferenceTarget(kind: .app, id: id, label: nil)
        }
        if let id = schemeID(target, scheme: "skill") {
            return RichReferenceTarget(kind: .skill, id: id, label: nil)
        }
        if target.hasPrefix("/") {
            return RichReferenceTarget(kind: pathKind(target), id: target, label: nil)
        }
        return webTarget(target, text: text)
    }

    /// The address a tap opens, or nil for a target the phone cannot hand to
    /// anything.
    ///
    /// Only the schemes the system itself routes. `haus://` names an in-app
    /// resource — the form the Agent system prompt tells Agents to write for a
    /// workspace file — and nothing on the phone opens one yet, so it reads as
    /// a link and stays inert. A schemeless or protocol-relative target names
    /// no address at all.
    public static func activationURL(for target: String) -> URL? {
        let trimmed = target.trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              openableSchemes.contains(scheme)
        else { return nil }
        return url
    }

    /// The pull-request number a GitHub-shaped URL names, mirroring
    /// `cloudAgentPullRequestNumber` so both clients read the same digits out
    /// of the same URL.
    public static func pullRequestNumber(in url: String) -> Int? {
        guard let expression = pullRequestExpression else { return nil }
        let range = NSRange(url.startIndex..., in: url)
        guard let match = expression.firstMatch(in: url, range: range),
              let digits = Range(match.range(at: 1), in: url),
              let number = Int(url[digits]),
              number > 0
        else { return nil }
        return number
    }

    /// A file path ends in an extension; anything else is a directory.
    private static func pathKind(_ target: String) -> MentionPresentationKind {
        let finalSegment = target.split(separator: "/").last.map(String.init) ?? ""
        guard let dot = finalSegment.lastIndex(of: "."), dot < finalSegment.index(before: finalSegment.endIndex) else {
            return .directory
        }
        let extensionPart = finalSegment[finalSegment.index(after: dot)...]
        return extensionPart.allSatisfy(\.isAlphanumericASCII) ? .file : .directory
    }

    private static func webTarget(_ target: String, text: String) -> RichReferenceTarget? {
        guard let url = URL(string: target),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host, !host.isEmpty
        else { return nil }

        if let number = pullRequestNumber(in: target) {
            return RichReferenceTarget(kind: .pullRequest, id: target, label: "#\(number)")
        }
        return RichReferenceTarget(
            kind: .website,
            id: target,
            label: websiteLabel(text: text, target: target, host: host)
        )
    }

    /// A link's own words name the site; a link whose words *are* its URL reads
    /// as the host instead, the way the App labels an autolinked address.
    private static func websiteLabel(text: String, target: String, host: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let hostname = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        let normalized = trimmed.hasPrefix("www.") ? "https://\(trimmed)" : trimmed
        if normalized == target
            || normalized == "\(target)/"
            || "\(normalized)/" == target
            || trimmed.isEmpty {
            return hostname
        }
        return trimmed
    }

    private static func schemeID(_ target: String, scheme: String) -> String? {
        let prefix = "\(scheme)://"
        guard target.hasPrefix(prefix) else { return nil }
        let id = decoded(String(target.dropFirst(prefix.count)))
        return id.isEmpty ? nil : id
    }

    private static func decoded(_ value: String) -> String {
        value.removingPercentEncoding ?? value
    }

    private static let openableSchemes: Set<String> = ["http", "https", "mailto", "tel"]
    private static let appPrefix = "app://computer-use/"
    private static let pluginPrefix = "plugin://"
    private static let pullRequestExpression = try? NSRegularExpression(
        pattern: #"/pull(?:s|-requests)?/(\d+)(?:[/?#]|$)"#
    )
}

private extension Character {
    var isAlphanumericASCII: Bool { isASCII && (isLetter || isNumber) }
}
