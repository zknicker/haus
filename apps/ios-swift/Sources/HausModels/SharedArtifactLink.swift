import Foundation

/// Which links count as this Server's shared library: the App origins this
/// phone knows and the active Server's slug. The phone's half of the App's
/// `SharedArtifactLinkScope` (`features/chats/shared-artifact-link.ts`).
public struct SharedArtifactLinkScope: Equatable, Sendable {
    /// Origins as `scheme://host[:port]`, lowercased, default port dropped.
    /// The first resolves a root-relative `/s/<slug>/artifacts/<id>` link.
    public let origins: [String]
    public let slug: String

    public init(origins: [URL], slug: String) {
        var seen: [String] = []
        for origin in origins.compactMap(SharedArtifactLinkTarget.origin(of:)) where !seen.contains(origin) {
            seen.append(origin)
        }
        self.origins = seen
        self.slug = slug
    }

    /// The scope message bodies are parsed under. A task-local rather than a
    /// global, so a parse names the Server it belongs to and parallel parses
    /// (and tests) cannot see each other's. Nil means no link is a library
    /// link: it stays the website or path reference it reads as.
    @TaskLocal public static var current: SharedArtifactLinkScope?
}

/// One file in Files a message links to: the stable URL
/// `haus files push` returns, optionally pinned to a revision.
public struct SharedArtifactLinkTarget: Hashable, Sendable {
    public let artifactID: String
    public let revisionID: String?

    public init(artifactID: String, revisionID: String? = nil) {
        self.artifactID = artifactID
        self.revisionID = revisionID
    }

    /// A stable artifact URL on this App, for the Server that is open. Links
    /// to another origin, another Server's slug, or a workspace artifact page
    /// (whose key is `kind:agent:path`, never an `art_` id) are not one.
    public init?(href rawHref: String, scope: SharedArtifactLinkScope) {
        let href = rawHref.trimmingCharacters(in: .whitespaces)
        guard let url = Self.resolve(href, scope: scope),
              let origin = Self.origin(of: url),
              scope.origins.contains(origin),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let match = Self.parts(ofPath: components.percentEncodedPath),
              match.slug == scope.slug,
              match.artifactID.hasPrefix("art_"),
              !match.artifactID.contains(":")
        else { return nil }
        let revision = components.queryItems?
            .first(where: { $0.name == "revision" })?
            .value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.init(artifactID: match.artifactID, revisionID: revision?.isEmpty == false ? revision : nil)
    }

    /// The App's `sharedArtifactKey`: the id, or `id@revision` when pinned.
    public var key: String {
        revisionID.map { "\(artifactID)@\($0)" } ?? artifactID
    }

    public init?(key: String) {
        let parts = key.split(separator: "@", maxSplits: 1).map(String.init)
        guard let id = parts.first, id.hasPrefix("art_") else { return nil }
        self.init(artifactID: id, revisionID: parts.count == 2 && !parts[1].isEmpty ? parts[1] : nil)
    }

    /// The in-app address a chip carries. The scope was decided when the body
    /// was parsed, so a tap routes on this alone; the system has no app for
    /// the scheme, which is what keeps it from leaving Haus.
    public var inAppURL: URL? {
        var components = URLComponents()
        components.scheme = Self.inAppScheme
        components.path = artifactID
        if let revisionID { components.queryItems = [URLQueryItem(name: "revision", value: revisionID)] }
        return components.url
    }

    public init?(inAppURL url: URL) {
        guard url.scheme == Self.inAppScheme,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.path.hasPrefix("art_")
        else { return nil }
        let revision = components.queryItems?.first(where: { $0.name == "revision" })?.value
        self.init(artifactID: components.path, revisionID: revision?.isEmpty == false ? revision : nil)
    }

    /// The label a chip wears before its title loads, or when it cannot:
    /// the link's own words, unless those words are just the address.
    public static func fallbackLabel(text: String, target: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let isAddress = trimmed.isEmpty
            || trimmed == target.trimmingCharacters(in: .whitespaces)
            || trimmed.hasPrefix("http://")
            || trimmed.hasPrefix("https://")
            || trimmed.hasPrefix("/")
        return isAddress ? "File" : nil
    }

    static func origin(of url: URL) -> String? {
        guard let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host?.lowercased(), !host.isEmpty
        else { return nil }
        let defaultPort = scheme == "https" ? 443 : 80
        guard let port = url.port, port != defaultPort else { return "\(scheme)://\(host)" }
        return "\(scheme)://\(host):\(port)"
    }

    /// Only an absolute `http(s)` address or a root-relative path resolves;
    /// `//host` and bare words do not.
    private static func resolve(_ href: String, scope: SharedArtifactLinkScope) -> URL? {
        let lowered = href.lowercased()
        if lowered.hasPrefix("http://") || lowered.hasPrefix("https://") {
            return URL(string: href)
        }
        guard href.hasPrefix("/"), !href.hasPrefix("//"),
              let base = scope.origins.first.flatMap(URL.init(string:))
        else { return nil }
        return URL(string: href, relativeTo: base)?.absoluteURL
    }

    private static func parts(ofPath path: String) -> (slug: String, artifactID: String)? {
        var segments = path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        // `/s/<slug>/artifacts/<id>` with one optional trailing slash.
        if segments.last == "" && segments.count == 6 { segments.removeLast() }
        guard segments.count == 5, segments[0].isEmpty, segments[1] == "s", segments[3] == "artifacts",
              let slug = segments[2].removingPercentEncoding, !slug.isEmpty,
              let id = segments[4].removingPercentEncoding, !id.isEmpty
        else { return nil }
        return (slug, id)
    }

    private static let inAppScheme = "haus-artifact"
}
