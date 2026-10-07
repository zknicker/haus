import Foundation

/// One artifact page as the Agent's workspace returned it.
public struct ArtifactPageFile: Sendable, Equatable {
    public let html: String
    /// The Computer caps a read; a truncated page may render incomplete.
    public let truncated: Bool

    public init(html: String, truncated: Bool) {
        self.html = html
        self.truncated = truncated
    }
}

/// Why a page could not be opened, in the words the page sheet says.
public enum ArtifactPageUnavailable: Error, Equatable, Sendable {
    /// The Agent's Computer did not answer — offline, asleep, or unreachable.
    case computerUnreachable
    /// The viewer may not read this Agent's workspace.
    case forbidden
    /// The file is not an HTML page the phone can show.
    case notAPage
    /// Anything else: the read failed for a reason the phone cannot name.
    case failed

    public var title: String {
        switch self {
        case .computerUnreachable: "Page unavailable"
        case .forbidden: "Page not shared with you"
        case .notAPage: "Can’t show this file"
        case .failed: "Page unavailable"
        }
    }

    public var message: String {
        switch self {
        case .computerUnreachable:
            "This page lives on the Agent’s Computer, which isn’t reachable right now. Try again once it’s back online."
        case .forbidden:
            "You don’t have access to this Agent’s workspace."
        case .notAPage:
            "This file isn’t an HTML page, so it can’t be opened here."
        case .failed:
            "Haus couldn’t load this page. Try again in a moment."
        }
    }

    /// Whether trying again could help.
    public var isRetryable: Bool { self == .computerUnreachable || self == .failed }
}

/// Reads an artifact page from the authoring Agent's workspace.
///
/// Artifact cards are drawn in transcript cells, which inherit no custom
/// environment, so the App installs the reader here once at its root — the
/// same seam `InAppReferenceRoutes` uses for reference taps. Nothing installed
/// (previews, tests) reads as an unreachable Computer.
@MainActor
public enum ArtifactPageReader {
    public static var read: ((_ agentID: String, _ path: String) async throws -> ArtifactPageFile)?

    static func load(agentID: String, path: String) async -> Result<ArtifactPageFile, ArtifactPageUnavailable> {
        guard let read else { return .failure(.computerUnreachable) }
        do {
            return .success(try await read(agentID, path))
        } catch let unavailable as ArtifactPageUnavailable {
            return .failure(unavailable)
        } catch {
            return .failure(.failed)
        }
    }
}

/// The document an artifact page renders as: the Agent's own HTML with the
/// app's resolved tokens riding in, the App's `injectHostTokenStyle`. Unlike a
/// visual, the page is a whole document the Agent wrote, so nothing wraps it;
/// the token block goes right after `<head>` when there is one, else in front.
/// A viewport rule rides along for a page written without one, so it lays out
/// at the phone's width rather than a desktop's.
public enum ArtifactPageDocument {
    public static func make(html: String, scheme: AgentHtmlColorScheme) -> String {
        let tokens = AgentHtmlTokens.table(for: scheme)
            .map { "\($0.name):\($0.value);" }
            .joined()
        var injected = "<style data-haus-tokens>:root{color-scheme:\(scheme.rawValue);\(tokens)}</style>"
        if html.range(of: #"<meta[^>]+name=["']?viewport"#, options: [.regularExpression, .caseInsensitive]) == nil {
            injected = "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" + injected
        }
        guard let head = html.range(of: #"<head(\s[^>]*)?>"#, options: [.regularExpression, .caseInsensitive]) else {
            return injected + html
        }
        return html.replacingCharacters(in: head.upperBound..<head.upperBound, with: injected)
    }
}
