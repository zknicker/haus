import Foundation
@testable import HausUI
import Testing

/// Every wire form the App turns into a reference chip, read by the phone's
/// parser.
///
/// The table is the contract: one row per form, naming the kind it resolves to,
/// the label it reads as, and the mark it draws. `coversEveryReferenceKind`
/// keeps it honest — a kind added to `MentionPresentationKind` without a row
/// here fails.
struct RichReferenceParityTests {
    private struct Row {
        let markdown: String
        let kind: MentionPresentationKind
        let id: String
        let label: String
        let mark: RichReferenceMark
    }

    private static let table: [Row] = [
        Row(
            markdown: "[@Planner](agent://agent%3Aplanner)",
            kind: .agent,
            id: "agent:planner",
            label: "Planner",
            mark: .avatar(nil)
        ),
        Row(
            markdown: "[@You](user://usr_haus)",
            kind: .human,
            id: "usr_haus",
            label: "You",
            mark: .avatar(nil)
        ),
        // The phone reads a Channel slug as words where the App prints the
        // stored name; the mark, kind, and target are the same.
        Row(
            markdown: "[#product](chat://cht_product)",
            kind: .channel,
            id: "cht_product",
            label: "Product",
            mark: .channel(.default)
        ),
        // The Server's rewritten Thread mention: the Chat scheme with the
        // anchor in the query. The id keeps the whole target so both ids ride.
        Row(
            markdown: "[#launch plan](chat://cht_product?thread=msg_anchor)",
            kind: .thread,
            id: "chat://cht_product?thread=msg_anchor",
            label: "launch plan",
            mark: .glyph(.thread)
        ),
        Row(
            markdown: "[$ui](skill://ui)",
            kind: .skill,
            id: "ui",
            label: "UI",
            mark: .glyph(.skill)
        ),
        Row(
            markdown: "[$space-skill](skill://space-skill)",
            kind: .skill,
            id: "space-skill",
            label: "Space Skill",
            mark: .glyph(.skill)
        ),
        // The App names a few Skills and capabilities by hand, and the mark
        // travels with the name: a Chrome key wears the Chrome mark in the
        // `--success` brand ink, a GitHub Skill the GitHub mark in the Skill's
        // own purple, and every other capability keeps the plug.
        Row(
            markdown: "[$gh-issues](skill://gh-issues)",
            kind: .skill,
            id: "gh-issues",
            label: "GitHub Issues",
            mark: .glyph(.github)
        ),
        Row(
            markdown: "[$github](skill://github)",
            kind: .skill,
            id: "github",
            label: "GitHub",
            mark: .glyph(.github)
        ),
        Row(
            markdown: "[@Chrome](app://computer-use/com.google.Chrome)",
            kind: .app,
            id: "com.google.Chrome",
            label: "Chrome",
            mark: .brandGlyph(.chrome, .success)
        ),
        // A Mac app is keyed on its words alone, so the same bundle id under a
        // name the App does not write by hand keeps that name and the plug.
        Row(
            markdown: "[@Google Chrome](app://computer-use/com.google.Chrome)",
            kind: .app,
            id: "com.google.Chrome",
            label: "Google Chrome",
            mark: .glyph(.capability)
        ),
        // A plugin is named by its target rather than its words, the way the
        // App orders its lookup keys for every kind but `app`.
        Row(
            markdown: "[@Google Chrome](plugin://computer-use/google-chrome)",
            kind: .plugin,
            id: "computer-use/google-chrome",
            label: "Chrome",
            mark: .brandGlyph(.chrome, .success)
        ),
        Row(
            markdown: "[@Computer Use](plugin://computer-use@openai-bundled)",
            kind: .plugin,
            id: "computer-use@openai-bundled",
            label: "Computer Use",
            mark: .glyph(.capability)
        ),
        Row(
            markdown: "[@merchbase](plugin://merchbase)",
            kind: .plugin,
            id: "merchbase",
            label: "merchbase",
            mark: .glyph(.capability)
        ),
        Row(
            markdown: "[specs/mentions.md](/repo/specs/mentions.md)",
            kind: .file,
            id: "/repo/specs/mentions.md",
            label: "specs/mentions.md",
            mark: .glyph(.document)
        ),
        Row(
            markdown: "[specs](/repo/specs)",
            kind: .directory,
            id: "/repo/specs",
            label: "specs",
            mark: .glyph(.folder)
        ),
        Row(
            markdown: "[the pull request](https://github.com/haus/haus/pull/56)",
            kind: .pullRequest,
            id: "https://github.com/haus/haus/pull/56",
            label: "#56",
            mark: .glyph(.pullRequest)
        ),
        Row(
            markdown: "[the release notes](https://haus.dev/releases)",
            kind: .website,
            id: "https://haus.dev/releases",
            label: "the release notes",
            mark: .glyph(.website)
        ),
    ]

    @Test func readsEveryWireFormTheAppChips() {
        for row in Self.table {
            let segments = RichMessageParser.parse("Look at \(row.markdown) now.") { _, _, _ in nil }
            guard case .reference(let reference) = segments.first(where: { segment in
                if case .reference = segment { return true }
                return false
            }) else {
                Issue.record("No reference parsed from \(row.markdown)")
                continue
            }
            #expect(reference.kind == row.kind, "kind for \(row.markdown)")
            #expect(reference.id == row.id, "id for \(row.markdown)")
            #expect(reference.label == row.label, "label for \(row.markdown)")
            #expect(reference.mark == row.mark, "mark for \(row.markdown)")
        }
    }

    @Test func coversEveryReferenceKind() {
        let covered = Set(Self.table.map(\.kind))
        #expect(covered == Set(MentionPresentationKind.allCases))
    }

    /// A target this client does not chip is still an anchor on the App, so the
    /// phone shows its words. `haus://` is what Agents are told to write.
    @Test func readsAnUnchippedLinkAsItsOwnWords() {
        #expect(
            RichMessageParser.parse("Open [the workspace](haus://workspace/notes.md) later.") {
                _, _, _ in nil
            } == [
                .text("Open "),
                .link(text: "the workspace", target: "haus://workspace/notes.md"),
                .text(" later."),
            ]
        )
        #expect(
            RichMessageParser.parse("[report.html](haus://workspace/out/report.html)") {
                _, _, _ in nil
            } == [.link(text: "report.html", target: "haus://workspace/out/report.html")]
        )
    }

    /// Targets that look like links and are not references.
    @Test func leavesEveryUnchippableTargetAsALink() {
        let targets = [
            "mailto:ada@haus.dev",
            "ftp://files.haus.dev/notes.txt",
            "notascheme",
        ]
        for target in targets {
            #expect(
                RichMessageParser.parse("[x](\(target))") { _, _, _ in nil }
                    == [.link(text: "x", target: target)],
                "target \(target)"
            )
        }
    }

    /// The shared contract's path rule is `startsWith('/')`, so both clients
    /// read a protocol-relative `//host` as a path, not as an address.
    @Test func readsAProtocolRelativeTargetAsAPathTheWayTheContractDoes() {
        #expect(
            RichMessageParser.parse("[x](//protocol-relative.example.com)") { _, _, _ in nil }
                == [.reference(RichReferencePresentation(
                    id: "//protocol-relative.example.com",
                    kind: .file,
                    label: "x",
                    avatarURL: nil
                ))]
        )
    }

    /// A tap opens the two kinds whose target is a real address; every other
    /// kind names a Haus record the phone has no route to.
    @Test func opensOnlyTheReferencesWhoseTargetIsAnAddress() {
        let opens = { (kind: MentionPresentationKind, id: String) in
            RichReferencePresentation(id: id, kind: kind, label: "x", avatarURL: nil)
                .activationURL != nil
        }
        #expect(opens(.website, "https://haus.dev"))
        #expect(opens(.pullRequest, "https://github.com/haus/haus/pull/56"))
        #expect(!opens(.agent, "agt_cove"))
        #expect(!opens(.channel, "cht_product"))
        // A workspace resource names an in-app target nothing opens yet.
        #expect(RichReferenceWireForm.activationURL(for: "haus://workspace/notes.md") == nil)
        #expect(RichReferenceWireForm.activationURL(for: "notascheme") == nil)
        #expect(RichReferenceWireForm.activationURL(for: "mailto:ada@haus.dev") != nil)
    }

    @Test func readsAnImageAsMarkdownRatherThanAWebsiteReference() {
        let content = "Here: ![a chart](https://example.com/chart.png)"
        #expect(RichMessageParser.parse(content) { _, _, _ in nil } == [.text(content)])
    }

    /// The App's Markdown autolinks a bare address before the chip renderer
    /// sees it, so a pasted URL wears the same chip a written link does.
    @Test func chipsABareAddressAsItsHost() {
        let segments = RichMessageParser.parse("See https://example.com, then ship.") { _, _, _ in nil }

        #expect(segments == [
            .text("See "),
            .reference(RichReferencePresentation(
                id: "https://example.com",
                kind: .website,
                label: "example.com",
                avatarURL: nil
            )),
            .text(", then ship."),
        ])
    }

    @Test func readsABarePullRequestAddressAsItsNumber() {
        let segments = RichMessageParser
            .parse("Merged https://github.com/haus/haus/pull/56/files") { _, _, _ in nil }

        #expect(segments.contains(.reference(RichReferencePresentation(
            id: "https://github.com/haus/haus/pull/56/files",
            kind: .pullRequest,
            label: "#56",
            avatarURL: nil
        ))))
    }

    @Test func drawsTheSkillMarkSmallerThanEveryOtherMark() {
        #expect(RichReferenceMark.glyph(.skill).sizeScale < 1)
        #expect(RichReferenceMark.glyph(.document).sizeScale == 1)
        #expect(RichReferenceMark.avatar(nil).sizeScale == 1)
        #expect(RichReferenceMark.channel(.default).sizeScale == 1)
        // The shrink pays for the sparkles' own viewbox, so a Skill wearing a
        // brand mark instead is drawn at the same size as every other mark.
        #expect(RichReferenceMark.glyph(.github).sizeScale == 1)
        #expect(RichReferenceMark.brandGlyph(.chrome, .success).sizeScale == 1)
    }
}
