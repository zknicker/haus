import Foundation
@testable import HausUI
import Testing

/// The ```artifact fence, ported from the App's `splitArtifactFences` and the
/// shared props schema. Before, the phone read only `visual`, so an artifact
/// showed as a raw code block of JSON.
struct ArtifactFenceTests {
    private static let fence = "```"

    @Test func cutsAValidFenceOutOfTheProse() {
        let content = "Here is the report.\n\(Self.fence)artifact\n{\"path\":\"out/report.html\",\"title\":\"Q3 report\"}\n\(Self.fence)\nEnjoy."
        let body = VisualFence.body(content)

        #expect(body.prose == "Here is the report.\n\nEnjoy.")
        #expect(body.artifacts == [ArtifactSegment(ordinal: 1, path: "out/report.html", title: "Q3 report")])
        #expect(body.visuals.isEmpty)
    }

    @Test func readsAnOpenerGluedToASentenceAndATerminatorGluedToTheJSON() {
        let content = "Done:\(Self.fence)artifact\n{\"path\":\"a.htm\"}\(Self.fence) and \(Self.fence)artifact\n{\"path\":\"b/c.HTML\"}\n\(Self.fence)"
        let (text, artifacts) = ArtifactFence.extract(content)

        #expect(text == "Done: and ")
        #expect(artifacts.map(\.path) == ["a.htm", "b/c.HTML"])
        #expect(artifacts.map(\.ordinal) == [1, 2])
        #expect(artifacts[0].displayTitle == "a.htm")
        #expect(artifacts[1].fileName == "c.HTML")
    }

    @Test func leavesAnInvalidPayloadAsText() {
        let payloads = [
            #"{"path":"../secrets.html"}"#,
            #"{"path":"/etc/page.html"}"#,
            #"{"path":"a\\b.html"}"#,
            #"{"path":"notes.md"}"#,
            #"{"path":"a//b.html"}"#,
            #"{"path":"page.html","height":400}"#,
            #"{"path":"page.html","title":"   "}"#,
            #"{"path":42}"#,
            "not json",
        ]
        for payload in payloads {
            let content = "\(Self.fence)artifact\n\(payload)\n\(Self.fence)"
            let (text, artifacts) = ArtifactFence.extract(content)
            #expect(artifacts.isEmpty, "payload \(payload)")
            #expect(text == content, "payload \(payload)")
        }
    }

    @Test func trimsThePathAndTitleTheWayTheSchemaDoes() {
        let content = "\(Self.fence)artifact\n{\"path\":\"  out/page.html \",\"title\":\" Plan \"}\n\(Self.fence)"
        #expect(ArtifactFence.extract(content).artifacts == [ArtifactSegment(ordinal: 1, path: "out/page.html", title: "Plan")])
    }

    @Test func aPreviewReadsThePagesNameInsteadOfItsJSON() {
        let titled = "See \(Self.fence)artifact\n{\"path\":\"out/report.html\",\"title\":\"Q3 report\"}\n\(Self.fence)"
        #expect(VisualFence.previewText(titled) == "See Q3 report")

        let untitled = "\(Self.fence)artifact\n{\"path\":\"out/report.html\"}\n\(Self.fence)"
        #expect(VisualFence.previewText(untitled) == "Artifact: out/report.html")
    }

    @Test func aMessageWithoutAFenceIsUntouched() {
        #expect(ArtifactFence.extract("Just words.").artifacts.isEmpty)
        #expect(ArtifactFence.extract("Just words.").text == "Just words.")
    }

    // MARK: - Page document

    @Test func tokensRideInRightAfterTheHead() {
        let page = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width\"><title>x</title></head><body>hi</body></html>"
        let document = ArtifactPageDocument.make(html: page, scheme: .dark)

        #expect(document.hasPrefix("<!doctype html><html><head><style data-haus-tokens>:root{color-scheme:dark;--font-sans:"))
        #expect(document.hasSuffix("<title>x</title></head><body>hi</body></html>"))
        #expect(!document.contains("initial-scale=1"), "A page with its own viewport keeps it")
    }

    @Test func aPageWithoutAHeadGetsTokensAndAViewportInFront() {
        let document = ArtifactPageDocument.make(html: "<header>Top</header><p>hi</p>", scheme: .light)

        #expect(document.hasPrefix("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style data-haus-tokens>:root{color-scheme:light;"))
        #expect(document.hasSuffix("</style><header>Top</header><p>hi</p>"))
    }

    /// The sheet used to blame the Agent's Computer even when the phone had
    /// lost the Server, so it named the wrong thing to fix.
    @Test func anOfflinePhoneIsNotAnUnreachableComputer() {
        let offline = ArtifactPageUnavailable.offline
        #expect(offline.title != ArtifactPageUnavailable.computerUnreachable.title)
        #expect(!offline.message.contains("Computer"))
        #expect(offline.isRetryable)
        #expect(!ArtifactPageUnavailable.forbidden.isRetryable)
        #expect(!ArtifactPageUnavailable.notAPage.isRetryable)
    }
}
