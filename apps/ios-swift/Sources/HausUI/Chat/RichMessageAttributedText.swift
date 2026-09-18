import CoreGraphics
import Foundation
import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

extension NSAttributedString.Key {
    /// Carries the `RichReferenceRun` a capsule is drawn behind.
    static let hausReference = NSAttributedString.Key("hausReference")
    /// Marks a code span. Its plate is drawn by the layout manager rather than
    /// by `.backgroundColor`, so it hugs the span's glyphs instead of filling
    /// the line fragment a wrapped span leaves behind.
    static let hausCodeSpan = NSAttributedString.Key("hausCodeSpan")
}

/// One mention as the text engine sees it: the identity the mark is drawn from
/// and the geometry that reserved its room.
///
/// Value equality is the point of the overrides. `NSAttributedString` equality
/// falls back to object identity for custom attributes, so an identical body
/// rebuilt on the next SwiftUI update would otherwise look like new text and
/// throw away the text view's layout.
final class RichReferenceRun: NSObject {
    let reference: RichReferencePresentation
    let geometry: RichReferenceMarkGeometry
    /// What the whole run — the spacer and the label — measures on one line,
    /// taken once here so `RichReferenceLineBreaker` can answer a break
    /// opportunity without measuring anything.
    let naturalWidth: CGFloat

    init(
        reference: RichReferencePresentation,
        geometry: RichReferenceMarkGeometry,
        naturalWidth: CGFloat
    ) {
        self.reference = reference
        self.geometry = geometry
        self.naturalWidth = naturalWidth
    }

    override func isEqual(_ object: Any?) -> Bool {
        guard let other = object as? RichReferenceRun else { return false }
        return reference == other.reference
            && geometry == other.geometry
            && naturalWidth == other.naturalWidth
    }

    override var hash: Int {
        var hasher = Hasher()
        hasher.combine(reference)
        hasher.combine(geometry.lineBox)
        hasher.combine(naturalWidth)
        return hasher.finalize()
    }
}

/// A message body as one attributed string: its words and its mentions in the
/// same font, on the same baseline, in one run of text.
///
/// A mention is ordinary text — no baseline offset, no smaller size, no
/// attachment standing in for the label — so it wraps, selects, and reads with
/// the sentence. The only thing it adds is one zero-height spacer attachment
/// that buys the mark's room before the label; `RichReferenceLayoutManager`
/// paints the mark there and the dotted rule under the label.
enum RichMessageAttributedText {
    static func make(
        segments: [RichMessageSegment],
        textStyle: Font.TextStyle,
        dynamicTypeSize: DynamicTypeSize,
        legibilityWeight: LegibilityWeight?,
        appearance: RichMessageTextAppearance = .body
    ) -> NSAttributedString {
        let font = appearance.font(
            base: PlatformTextMetrics.font(
                for: textStyle,
                dynamicTypeSize: dynamicTypeSize,
                legibilityWeight: legibilityWeight
            )
        )
        return make(
            segments: segments,
            font: font,
            metrics: PlatformTextMetrics.metrics(of: font),
            // Medium, not the App's 700: bold read as distracting in running text on
            // the phone. Bold Text still adds a step above it.
            referenceWeight: legibilityWeight == .bold ? .bold : .medium,
            bodyColor: appearance.isMuted
                ? RichReferenceChipInk.mutedText
                : RichReferenceChipInk.bodyText
        )
    }

    /// The portable core: fonts and metrics in, one attributed string out.
    static func make(
        segments: [RichMessageSegment],
        font: PlatformFont,
        metrics: PlatformFontMetrics,
        referenceWeight: PlatformFont.Weight = .medium,
        bodyColor: PlatformColor = RichReferenceChipInk.bodyText
    ) -> NSAttributedString {
        let geometry = RichReferenceMarkGeometry(metrics: metrics)
        // The same point size as the body, only heavier: SF's ascent and
        // descent do not move with weight, so the line box is untouched.
        let referenceFont = PlatformFont.systemFont(
            ofSize: font.pointSize,
            weight: referenceWeight
        )
        let body = NSMutableAttributedString()
        for segment in segments {
            switch segment {
            case .text(let run, let style):
                body.append(textRun(run, style: style, font: font, color: bodyColor))
            case .reference(let reference):
                body.append(
                    referenceRun(reference, geometry: geometry, font: referenceFont)
                )
            case .link(let text, let target):
                body.append(linkRun(text: text, target: target, font: font))
            }
        }
        return body
    }

    /// One run of words wearing the marks the author wrote: bold and italic as
    /// traits of the block's own face, a code span in the system monospace on
    /// its own faint plate, and a struck run with the system's own line.
    private static func textRun(
        _ run: String,
        style: RichInlineStyle,
        font: PlatformFont,
        color: PlatformColor
    ) -> NSAttributedString {
        var attributes: [NSAttributedString.Key: Any] = [
            .font: style.font(base: font),
            .foregroundColor: color,
        ]
        if style.contains(.strikethrough) {
            attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
        }
        if style.contains(.code) {
            attributes[.hausCodeSpan] = true
        }
        return NSAttributedString(string: run, attributes: attributes)
    }

    /// The body read aloud: its words, with each mention named by kind so the
    /// capsule's meaning survives without it.
    static func accessibilityLabel(for segments: [RichMessageSegment]) -> String {
        segments.map { segment in
            switch segment {
            case .text(let run, _):
                run
            case .reference(let reference):
                "\(reference.kind.referenceKindLabel) reference, \(reference.label)"
            case .link(let text, _):
                text
            }
        }
        .joined()
    }

    /// A rendered body read back as the sentence it draws: the spacers and the
    /// joiners resolved away, the label itself already verbatim.
    static func plainText(_ rendered: String) -> String {
        rendered
            .replacingOccurrences(of: "\u{FFFC}", with: "")
            .replacingOccurrences(of: wordJoiner, with: "")
    }

    /// A link this client does not chip: no capsule, no mark, just the words it
    /// was written with, underlined in the system link ink the way the App's
    /// own anchors read.
    ///
    /// A run the system can route carries a real `.link`, which is what makes
    /// the text engine treat it as a link: the tap that opens it, the long
    /// press the text view refuses, and the VoiceOver links rotor all come from
    /// that one attribute. The run keeps its own ink and underline because the
    /// text view clears `linkTextAttributes`. A `haus://` resource names an
    /// in-app target nothing on the phone opens yet, so it draws the same way
    /// and stays inert.
    private static func linkRun(
        text: String,
        target: String,
        font: PlatformFont
    ) -> NSAttributedString {
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: RichReferenceChipInk.linkText,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]
        if let url = RichReferenceWireForm.activationURL(for: target) {
            attributes[.link] = url
        }
        return NSAttributedString(string: text, attributes: attributes)
    }

    private static func referenceRun(
        _ reference: RichReferencePresentation,
        geometry: RichReferenceMarkGeometry,
        font: PlatformFont
    ) -> NSAttributedString {
        // The label keeps its own spaces and hyphens: a name is held together
        // by the break policy in `RichReferenceLineBreaking`, not by sealing
        // its break opportunities shut, which turned a long label into one
        // token wider than the column and forced character wrapping.
        let label = NSAttributedString(
            string: reference.label,
            attributes: [
                .font: font,
                .foregroundColor: RichReferenceChipInk.labelTint(for: reference),
            ]
        )
        let run = NSMutableAttributedString()
        run.append(spacer(width: geometry.leadingSpacer, font: font))
        run.append(label)
        run.addAttribute(
            .hausReference,
            value: RichReferenceRun(
                reference: reference,
                geometry: geometry,
                // The spacer advances by its attachment bounds, so the run's
                // single-line width is the label's plus that.
                naturalWidth: label.size().width + geometry.leadingSpacer
            ),
            range: NSRange(location: 0, length: run.length)
        )
        // A chip whose target is a real address is a link like any other. The
        // attribute covers the spacer as well as the label, so the mark opens
        // it too rather than leaving a dead margin before the words.
        if let url = reference.activationURL {
            run.addAttribute(.link, value: url, range: NSRange(location: 0, length: run.length))
        }
        return run
    }

    /// A zero-height attachment: it advances the line by `width` and adds
    /// nothing to the line's own box, which is what keeps a mention's line at
    /// the pitch of a plain one. The word joiner after it is what stops the
    /// engine breaking there — an attachment character is a break opportunity,
    /// and a label may not come away from its own mark.
    ///
    /// There is one, before the label. The App's chip carries no inline padding
    /// at all, so nothing is bought after the label either: punctuation hugs
    /// the last word and the next word is separated by its own space, exactly
    /// as in plain prose.
    private static func spacer(width: CGFloat, font: PlatformFont) -> NSAttributedString {
        let attachment = NSTextAttachment()
        attachment.bounds = CGRect(x: 0, y: 0, width: width, height: 0)
        let spacer = NSMutableAttributedString()
        spacer.append(NSAttributedString(attachment: attachment))
        spacer.append(NSAttributedString(string: Self.wordJoiner))
        spacer.addAttribute(
            .font,
            value: font,
            range: NSRange(location: 0, length: spacer.length)
        )
        return spacer
    }

    private static let wordJoiner = "\u{2060}"
}

extension MentionPresentationKind {
    /// How a reference names itself to VoiceOver.
    var referenceKindLabel: String {
        switch self {
        case .agent: "Agent"
        case .app: "App"
        case .channel: "Channel"
        case .directory: "Directory"
        case .file: "File"
        case .human: "Human"
        case .plugin: "Plugin"
        case .pullRequest: "Pull request"
        case .skill: "Skill"
        case .website: "Website"
        }
    }
}
