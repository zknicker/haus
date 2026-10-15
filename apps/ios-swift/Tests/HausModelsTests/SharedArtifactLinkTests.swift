import Foundation
@testable import HausModels
import Testing

/// The phone's port of the App's `parseSharedArtifactLink`
/// (`apps/website/src/features/chats/shared-artifact-link.ts`).
struct SharedArtifactLinkTests {
    private static let scope = SharedArtifactLinkScope(
        origins: [URL(string: "https://haus.chat")!, URL(string: "http://localhost:43444")!],
        slug: "acme"
    )

    @Test(arguments: [
        ("https://haus.chat/s/acme/artifacts/art_1", "art_1", nil),
        ("https://haus.chat/s/acme/artifacts/art_1/", "art_1", nil),
        ("https://HAUS.chat:443/s/acme/artifacts/art_1", "art_1", nil),
        ("http://localhost:43444/s/acme/artifacts/art_1", "art_1", nil),
        ("/s/acme/artifacts/art_1", "art_1", nil),
        ("https://haus.chat/s/acme/artifacts/art_1?revision=rev_2", "art_1", "rev_2"),
        ("/s/acme/artifacts/art_1?revision=%20rev_2%20", "art_1", "rev_2"),
        ("/s/acme/artifacts/art_1?revision=", "art_1", nil),
        ("/s/ac%6De/artifacts/art_%31", "art_1", nil),
    ] as [(String, String, String?)])
    func readsALibraryLinkOnThisServer(href: String, artifactID: String, revisionID: String?) {
        let target = SharedArtifactLinkTarget(href: href, scope: Self.scope)
        #expect(target == SharedArtifactLinkTarget(artifactID: artifactID, revisionID: revisionID))
    }

    @Test(arguments: [
        // Another origin, or one the phone does not know.
        "https://evil.example/s/acme/artifacts/art_1",
        "http://haus.chat/s/acme/artifacts/art_1",
        "http://localhost:43447/s/acme/artifacts/art_1",
        // Another Server's slug.
        "https://haus.chat/s/other/artifacts/art_1",
        "/s/other/artifacts/art_1",
        // A workspace artifact page's key, never an `art_` id.
        "/s/acme/artifacts/file:agt_1:out/report.html",
        "/s/acme/artifacts/art_1:agt",
        "/s/acme/artifacts/report",
        // Not the library path, or not resolvable against the App.
        "/s/acme/artifacts",
        "/s/acme/artifacts/art_1/versions",
        "//haus.chat/s/acme/artifacts/art_1",
        "s/acme/artifacts/art_1",
        "haus://workspace/s/acme/artifacts/art_1",
    ])
    func leavesEveryOtherLinkAlone(href: String) {
        #expect(SharedArtifactLinkTarget(href: href, scope: Self.scope) == nil)
    }

    @Test func roundTripsThroughItsKeyAndInAppAddress() throws {
        for target in [
            SharedArtifactLinkTarget(artifactID: "art_1"),
            SharedArtifactLinkTarget(artifactID: "art_1", revisionID: "rev_2"),
        ] {
            #expect(SharedArtifactLinkTarget(key: target.key) == target)
            let url = try #require(target.inAppURL)
            #expect(SharedArtifactLinkTarget(inAppURL: url) == target)
        }
        #expect(SharedArtifactLinkTarget(artifactID: "art_1", revisionID: "rev_2").key == "art_1@rev_2")
        #expect(SharedArtifactLinkTarget(inAppURL: URL(string: "https://haus.chat/art_1")!) == nil)
    }

    @Test func fallsBackToArtifactOnlyWhenTheWordsAreTheAddress() {
        let href = "https://haus.chat/s/acme/artifacts/art_1"
        #expect(SharedArtifactLinkTarget.fallbackLabel(text: href, target: href) == "File")
        #expect(SharedArtifactLinkTarget.fallbackLabel(text: "/s/acme/artifacts/art_1", target: "/s/acme/artifacts/art_1") == "File")
        #expect(SharedArtifactLinkTarget.fallbackLabel(text: "Q3 report", target: href) == nil)
    }

    @Test func scopeNormalizesAndDeduplicatesOrigins() {
        let scope = SharedArtifactLinkScope(
            origins: [URL(string: "https://Haus.chat/")!, URL(string: "https://haus.chat:443")!, URL(string: "haus://x")!],
            slug: "acme"
        )
        #expect(scope.origins == ["https://haus.chat"])
    }
}
