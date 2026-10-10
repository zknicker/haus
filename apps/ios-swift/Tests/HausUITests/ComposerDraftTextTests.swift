import Foundation
@testable import HausUI
import SwiftUI
import Testing

/// The composer shows a picked mention as the transcript's chip while the
/// draft it sends stays the Markdown the picker wrote.
@MainActor
struct ComposerDraftTextTests {
    private let blippy = MentionOptionPresentation(
        id: "agent://agt_blippy",
        insertText: "@Blippy",
        label: "Blippy",
        detail: nil,
        kind: .agent,
        avatarURL: URL(string: "https://haus.test/blippy.png")
    )

    @Test func aPickedMentionShowsAsAChipAndSendsItsMarkdown() {
        let draft = ComposerMentionQuery.active(in: "Hey @Bl")!
            .inserting(blippy, into: "Hey @Bl")
        #expect(draft == "Hey [@Blippy](agent://agt_blippy) ")

        let shown = render(draft)

        // The field shows the label, never the Markdown or the target.
        #expect(RichMessageAttributedText.plainText(shown.string) == "Hey Blippy ")
        #expect(!shown.string.contains("agent://"))
        let chipStart = (shown.string as NSString).range(of: "Blippy").location
        let run = shown.attribute(.hausReference, at: chipStart, effectiveRange: nil)
            as? RichReferenceRun
        #expect(run?.reference.kind == .agent)
        #expect(run?.reference.label == "Blippy")
        #expect(run?.reference.avatarURL == blippy.avatarURL)
        #expect(ComposerDraftText.markdown(from: shown) == draft)
    }

    @Test func typedWordsAroundAChipRoundTripVerbatim() {
        let draft = "**bold** [@Blippy](agent://agt_blippy) and [docs](https://haus.dev) `code`"
        let shown = render(draft)
        let edited = NSMutableAttributedString(attributedString: shown)
        edited.append(NSAttributedString(string: " more"))

        #expect(ComposerDraftText.markdown(from: shown) == draft)
        #expect(ComposerDraftText.markdown(from: edited) == draft + " more")
        // Only what the picker writes is chipped: a web link stays as typed.
        #expect(shown.string.contains("[docs](https://haus.dev)"))
    }

    @Test func everyPickerKindChipsAndAnUnresolvedOneKeepsItsLabel() {
        let draft = "[@Ada](user://usr_ada) [#product](chat://cht_product) [$agent-browser](skill://agent-browser)"
        let pieces = ComposerDraftText.pieces(markdown: draft, options: [])
        let kinds = pieces.compactMap { piece -> MentionPresentationKind? in
            guard case .chip(_, let reference) = piece else { return nil }
            return reference.kind
        }
        #expect(kinds == [.human, .channel, .skill])
        guard case .chip(_, let ada) = pieces.first else {
            Issue.record("expected a chip")
            return
        }
        #expect(ada.label == "Ada")
        #expect(ada.avatarURL == nil)
    }

    @Test func twoMentionsOfOneAgentStayTwoChips() {
        let draft = "[@Blippy](agent://agt_blippy)[@Blippy](agent://agt_blippy)"
        #expect(ComposerDraftText.markdown(from: render(draft)) == draft)
    }

    /// Deleting the label's words must take the mark with them: the spacer
    /// carries an attachment the label does not, so a plain effective range
    /// stopped at the label and left a lone avatar in the field.
    @Test func anEditReachingIntoAChipTakesTheWholeChip() {
        let shown = render("Hi [@Blippy](agent://agt_blippy) ")
        let chip = chipRange(in: shown)
        let label = (shown.string as NSString).range(of: "Blippy")

        #expect(ComposerDraftText.expandingToChips(label, in: shown) == chip)
        let backspace = NSRange(location: NSMaxRange(chip) - 1, length: 1)
        #expect(ComposerDraftText.expandingToChips(backspace, in: shown) == chip)
        // The space after the chip and a caret at its edges are not the chip.
        let space = NSRange(location: NSMaxRange(chip), length: 1)
        #expect(ComposerDraftText.expandingToChips(space, in: shown) == space)
        let before = NSRange(location: chip.location, length: 0)
        #expect(ComposerDraftText.expandingToChips(before, in: shown) == before)
    }

    @Test func aCaretInsideAChipMovesAfterIt() {
        let shown = render("Hi [@Blippy](agent://agt_blippy) ")
        let chip = chipRange(in: shown)

        #expect(ComposerDraftText.caretOutsideChips(chip.location + 2, in: shown) == NSMaxRange(chip))
        #expect(ComposerDraftText.caretOutsideChips(chip.location, in: shown) == chip.location)
        #expect(ComposerDraftText.caretOutsideChips(1, in: shown) == 1)
    }

    /// Fast typing outran SwiftUI: an update still carrying "Hey c" arrived
    /// after "Hey ca" was typed, rebuilt the field, and the keyboard lost text.
    @Test func aLateEchoOfTheFieldsOwnDraftDoesNotRebuildIt() {
        var echoes = ComposerDraftEchoes()
        echoes.adopt("Hey ")
        let first = echoes.report("Hey c")
        let second = echoes.report("Hey ca")
        let lateEcho = echoes.isExternal("Hey c")
        let currentEcho = echoes.isExternal("Hey ca")
        let unchanged = echoes.report("Hey ca")

        #expect(first && second)
        #expect(!lateEcho)
        #expect(!currentEcho)
        #expect(!unchanged)
    }

    @Test func aDraftWrittenFromOutsideRebuildsTheField() {
        var echoes = ComposerDraftEchoes()
        echoes.adopt("")
        _ = echoes.report("x")
        _ = echoes.report("")
        _ = echoes.report("hi")
        let echo = echoes.isExternal("hi")
        // The clear on send is "", which the field once reported itself; it
        // is external because every earlier report has already echoed.
        let cleared = echoes.isExternal("")
        let picked = echoes.isExternal("Hey [@Blippy](agent://agt_blippy) ")

        #expect(!echo)
        #expect(cleared)
        #expect(picked)
    }

    private func render(_ markdown: String) -> NSAttributedString {
        ComposerDraftText.attributed(
            ComposerDraftText.pieces(markdown: markdown, options: [blippy]),
            font: PlatformTextMetrics.font(for: .body, dynamicTypeSize: .large),
            metrics: PlatformTextMetrics.metrics(for: .body, dynamicTypeSize: .large)
        )
    }

    private func chipRange(in text: NSAttributedString) -> NSRange {
        var found = NSRange(location: NSNotFound, length: 0)
        text.enumerateAttribute(
            .hausComposerChip,
            in: NSRange(location: 0, length: text.length)
        ) { value, range, stop in
            guard value != nil else { return }
            found = range
            stop.pointee = true
        }
        return found
    }
}
