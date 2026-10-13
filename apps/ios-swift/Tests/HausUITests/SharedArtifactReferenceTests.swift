import Foundation
import HausModels
@testable import HausUI
import Testing

/// Shared library links in a message body: chipped only inside the open
/// Server's scope, titled through `resolve`, and opened in-app.
struct SharedArtifactReferenceTests {
    private static let scope = SharedArtifactLinkScope(origins: [URL(string: "https://haus.chat")!], slug: "acme")

    private static func firstReference(
        _ content: String,
        scope: SharedArtifactLinkScope? = Self.scope,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation? = { _, _, _ in nil }
    ) -> RichReferencePresentation? {
        let segments = SharedArtifactLinkScope.$current.withValue(scope) {
            RichMessageParser.parse(content, resolve: resolve)
        }
        return segments.lazy.compactMap { segment -> RichReferencePresentation? in
            if case .reference(let reference) = segment { return reference }
            return nil
        }.first
    }

    @Test func outsideAScopeTheLinksKeepTheirOldReading() {
        #expect(Self.firstReference("[r](https://haus.chat/s/acme/artifacts/art_1)", scope: nil)?.kind == .website)
        #expect(Self.firstReference("[r](/s/acme/artifacts/art_1)", scope: nil)?.kind == .directory)
    }

    @Test func foreignSlugsAndOriginsAndWorkspaceKeysStayLinks() {
        #expect(Self.firstReference("[r](https://haus.chat/s/other/artifacts/art_1)")?.kind == .website)
        #expect(Self.firstReference("[r](https://evil.example/s/acme/artifacts/art_1)")?.kind == .website)
        #expect(Self.firstReference("[r](/s/acme/artifacts/report)")?.kind == .directory)
    }

    @Test func aBareAddressIsChippedAndResolvedLikeAWrittenLink() {
        var asked: [(MentionPresentationKind, String)] = []
        let reference = Self.firstReference("See https://haus.chat/s/acme/artifacts/art_9?revision=rev_1.") { kind, id, _ in
            asked.append((kind, id))
            return RichReferencePresentation(id: id, kind: kind, label: "Launch deck", avatarURL: nil, fileGlyph: .pdf)
        }
        #expect(asked.map(\.0) == [.sharedArtifact])
        #expect(asked.map(\.1) == ["art_9@rev_1"])
        #expect(reference?.label == "Launch deck")
        #expect(reference?.mark == .glyph(.pdf))
    }

    @MainActor
    @Test func aChipOpensInAppNeverInTheBrowser() throws {
        let reference = try #require(Self.firstReference("[r](/s/acme/artifacts/art_1?revision=rev_2)"))
        let url = try #require(reference.activationURL)
        #expect(url.scheme == "haus-artifact")
        #expect(SharedArtifactLinkTarget(inAppURL: url) == SharedArtifactLinkTarget(artifactID: "art_1", revisionID: "rev_2"))
        #expect(InAppReferenceRoutes.action(for: url) != nil)
        #expect(RichReferenceWireForm.activationURL(for: url.absoluteString) == nil)
    }
}
