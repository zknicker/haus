import Foundation

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

extension NSAttributedString.Key {
    /// Carries a composer chip's own Markdown (`ComposerChipSource`) across
    /// every character of the run that draws it.
    static let hausComposerChip = NSAttributedString.Key("hausComposerChip")
}

/// The Markdown one composer chip stands for.
///
/// Compared by identity, deliberately: two chips naming the same Agent side by
/// side are still two chips, and `NSAttributedString` merges adjacent runs whose
/// attribute values are equal.
final class ComposerChipSource: NSObject {
    let markdown: String

    init(markdown: String) {
        self.markdown = markdown
    }
}

/// Tells the field's own draft reports apart from drafts written from outside.
///
/// Typing outruns SwiftUI's updates, so an update can still carry the draft
/// from a keystroke or two ago. Rebuilding the field from it threw away what
/// was typed since and left the keyboard believing it had typed text the field
/// no longer held, so it dropped characters. A late echo of a report is
/// ignored; anything else — a picked mention, the clear on send, a restored
/// draft — is external and rebuilds the field.
struct ComposerDraftEchoes {
    /// The Markdown the field shows, as last built or last reported.
    private(set) var current: String?
    private var unechoed: [String] = []

    /// Records the field's own draft. False when nothing changed.
    mutating func report(_ markdown: String) -> Bool {
        guard markdown != current else { return false }
        current = markdown
        unechoed.append(markdown)
        return true
    }

    /// Whether a binding value came from outside the field.
    mutating func isExternal(_ value: String) -> Bool {
        if value == current {
            unechoed.removeAll()
            return false
        }
        if let echoed = unechoed.firstIndex(of: value) {
            unechoed.removeSubrange(...echoed)
            return false
        }
        return true
    }

    /// The field was rebuilt from `value`.
    mutating func adopt(_ value: String) {
        current = value
        unechoed.removeAll()
    }
}

/// The composer draft as the two things it is at once: the Markdown it sends
/// and the text it shows.
///
/// The draft stays Markdown — `[@Blippy](agent://agt_…)` is what the picker
/// writes, what a failed send restores, and what `chat.send` receives. The
/// field shows each picked reference as the transcript's own chip instead: the
/// same mark, label, and dotted rule, built by `RichMessageAttributedText` and
/// painted by `RichReferenceLayoutManager`. Only the kinds the picker inserts
/// are chipped; any other Markdown the person types stays exactly as typed,
/// because the field is for writing it, not for rendering it.
enum ComposerDraftText {
    enum Piece: Equatable {
        case text(String)
        case chip(markdown: String, reference: RichReferencePresentation)
    }

    /// The kinds `ComposerMentionQuery` writes into a draft.
    static let chippedKinds: Set<MentionPresentationKind> = [.agent, .human, .channel, .skill]

    /// Splits a draft into the words it shows verbatim and the references it
    /// shows as chips. `options` are the composer's mention roster; a chip
    /// takes its avatar or channel appearance from the option that wrote it,
    /// and an unresolvable one keeps its written label and initials.
    static func pieces(
        markdown: String,
        options: [MentionOptionPresentation]
    ) -> [Piece] {
        guard let expression = linkExpression else { return [.text(markdown)] }
        var pieces: [Piece] = []
        var cursor = markdown.startIndex
        let matches = expression.matches(
            in: markdown,
            range: NSRange(markdown.startIndex..., in: markdown)
        )
        for match in matches {
            guard let range = Range(match.range(at: 0), in: markdown),
                  let labelRange = Range(match.range(at: 1), in: markdown),
                  let targetRange = Range(match.range(at: 2), in: markdown)
            else { continue }
            let label = String(markdown[labelRange])
            let target = String(markdown[targetRange])
            guard let reference = reference(label: label, target: target, options: options)
            else { continue }
            if cursor < range.lowerBound {
                pieces.append(.text(String(markdown[cursor..<range.lowerBound])))
            }
            pieces.append(.chip(markdown: String(markdown[range]), reference: reference))
            cursor = range.upperBound
        }
        if cursor < markdown.endIndex {
            pieces.append(.text(String(markdown[cursor...])))
        }
        return pieces
    }

    /// The text the field shows. Each chip is the transcript's reference run
    /// with its Markdown attached; the words around it are plain body text.
    static func attributed(
        _ pieces: [Piece],
        font: PlatformFont,
        metrics: PlatformFontMetrics
    ) -> NSAttributedString {
        let text = NSMutableAttributedString()
        for piece in pieces {
            switch piece {
            case .text(let words):
                text.append(NSAttributedString(string: words, attributes: bodyAttributes(font: font)))
            case .chip(let markdown, let reference):
                let run = NSMutableAttributedString(
                    attributedString: RichMessageAttributedText.make(
                        segments: [.reference(reference)],
                        font: font,
                        metrics: metrics
                    )
                )
                run.addAttribute(
                    .hausComposerChip,
                    value: ComposerChipSource(markdown: markdown),
                    range: NSRange(location: 0, length: run.length)
                )
                text.append(run)
            }
        }
        return text
    }

    /// The Markdown the field's text stands for: every chip as the Markdown it
    /// was built from, and every other character as typed.
    static func markdown(from text: NSAttributedString) -> String {
        var markdown = ""
        text.enumerateAttribute(
            .hausComposerChip,
            in: NSRange(location: 0, length: text.length)
        ) { value, range, _ in
            if let chip = value as? ComposerChipSource {
                markdown += chip.markdown
            } else {
                markdown += RichMessageAttributedText.plainText(
                    text.attributedSubstring(from: range).string
                )
            }
        }
        return markdown
    }

    /// The whole chip runs a character range touches, so an edit never leaves
    /// half a chip behind: deleting into one removes all of it, and typing
    /// over part of one replaces all of it.
    static func expandingToChips(_ range: NSRange, in text: NSAttributedString) -> NSRange {
        var expanded = range
        let probes = range.length == 0
            ? [range.location]
            : [range.location, NSMaxRange(range) - 1]
        for location in probes where location >= 0 && location < text.length {
            guard let chipRange = chipRange(at: location, in: text) else { continue }
            // A caret before a chip's first character or after its last is
            // not inside it; only an edit that reaches into the run grows.
            if range.length == 0, location == chipRange.location { continue }
            expanded = NSUnionRange(expanded, chipRange)
        }
        return expanded
    }

    /// Where a caret that landed inside a chip belongs: after it. A chip is
    /// one thing, so there is no position between its mark and its words.
    static func caretOutsideChips(_ location: Int, in text: NSAttributedString) -> Int {
        guard location > 0, location < text.length else { return location }
        guard let chipRange = chipRange(at: location, in: text),
              chipRange.location < location
        else { return location }
        return NSMaxRange(chipRange)
    }

    /// The whole chip at `location`. The longest effective range, because a
    /// chip's spacer carries an attachment its label does not, so the plain
    /// effective range at the label stops short of the spacer — and a delete
    /// expanded to it left the mark behind with no words.
    private static func chipRange(at location: Int, in text: NSAttributedString) -> NSRange? {
        var range = NSRange()
        guard text.attribute(
            .hausComposerChip,
            at: location,
            longestEffectiveRange: &range,
            in: NSRange(location: 0, length: text.length)
        ) != nil else { return nil }
        return range
    }

    /// Whether typing with these attributes would write part of a chip.
    static func carriesChip(_ attributes: [NSAttributedString.Key: Any]) -> Bool {
        attributes[.hausComposerChip] != nil
            || attributes[.hausReference] != nil
            || attributes[.attachment] != nil
    }

    static func bodyAttributes(font: PlatformFont) -> [NSAttributedString.Key: Any] {
        [.font: font, .foregroundColor: RichReferenceChipInk.bodyText]
    }

    private static func reference(
        label: String,
        target: String,
        options: [MentionOptionPresentation]
    ) -> RichReferencePresentation? {
        guard let wire = RichReferenceWireForm.read(target: target, text: label),
              chippedKinds.contains(wire.kind)
        else { return nil }
        let option = options.first { $0.id == target }
        return RichReferencePresentation(
            id: wire.id,
            kind: wire.kind,
            label: ReferenceLabel.display(option?.label ?? label, kind: wire.kind, id: wire.id),
            avatarURL: option?.avatarURL,
            channelAppearance: option?.channelAppearance
        )
    }

    /// The transcript parser's link grammar.
    private static let linkExpression = try? NSRegularExpression(
        pattern: #"\[([^\]\n]+)\]\(([^\)\n]+)\)"#
    )
}
