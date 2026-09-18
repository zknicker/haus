#if canImport(UIKit)
import SwiftUI
import UIKit

/// The message body's text engine: a non-editable, non-scrolling `UITextView`
/// over a TextKit 1 stack whose layout manager draws the reference capsules.
///
/// Rows are hosted in self-sizing cells, so the height this reports at the
/// proposed width is the row's height; `sizeThatFits(_:uiView:context:)` is
/// where that answer comes from.
struct RichMessageTextView: UIViewRepresentable {
    /// Everything the attributed body is built from. The text view keeps the
    /// last one it laid out: `NSTextAttachment` and the dynamic colors the
    /// chips carry compare by identity, so an identical body rebuilt on the
    /// next SwiftUI update would look like new text and throw the layout away.
    struct Content: Equatable {
        let segments: [RichMessageSegment]
        let textStyle: Font.TextStyle
        let dynamicTypeSize: DynamicTypeSize
        let legibilityWeight: LegibilityWeight?
        /// How the block this run belongs to sets its words before the
        /// author's own marks: a heading's step of size and weight, a quote's
        /// muted ink, or the body exactly as it was.
        var appearance: RichMessageTextAppearance = .body
    }

    let content: Content
    /// Changes when an avatar or the channel glyph catalog arrives. The text is
    /// identical across that change — only the marks are — so the repaint has
    /// to be asked for by hand.
    let markRevision: Int

    func makeCoordinator() -> RichMessageLinkCoordinator { RichMessageLinkCoordinator() }

    func makeUIView(context: Context) -> RichMessageUITextView {
        let storage = NSTextStorage()
        let layoutManager = RichReferenceLayoutManager()
        let container = NSTextContainer(
            size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
        )
        container.lineFragmentPadding = 0
        container.widthTracksTextView = true
        layoutManager.addTextContainer(container)
        storage.addLayoutManager(layoutManager)

        let view = RichMessageUITextView(frame: .zero, textContainer: container)
        layoutManager.claimLineBreaking()
        view.isEditable = false
        // Selection is what makes a link interactive as well as copyable, so
        // it stays on.
        view.isSelectable = true
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.dataDetectorTypes = []
        view.delegate = context.coordinator
        // A link run already carries the ink and the underline it should draw
        // in — the App's link color for an anchor, the chip's own tint for a
        // capsule — so UIKit's blue-and-underlined overlay is cleared rather
        // than replaced.
        view.linkTextAttributes = [:]
        // Dynamic Type is answered by rebuilding the body from the
        // environment's size, so the text view must not scale it a second time.
        view.adjustsFontForContentSizeCategory = false
        view.setContentHuggingPriority(.required, for: .vertical)
        view.setContentCompressionResistancePriority(.required, for: .vertical)
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        apply(to: view)
        return view
    }

    func updateUIView(_ view: RichMessageUITextView, context: Context) {
        apply(to: view)
    }

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        uiView: RichMessageUITextView,
        context: Context
    ) -> CGSize? {
        guard let width = proposal.width, width.isFinite, width > 0 else {
            return uiView.sizeThatFits(
                CGSize(
                    width: CGFloat.greatestFiniteMagnitude,
                    height: CGFloat.greatestFiniteMagnitude
                )
            )
        }
        let fitted = uiView.sizeThatFits(
            CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
        )
        return CGSize(width: width, height: ceil(fitted.height))
    }

    private func apply(to view: RichMessageUITextView) {
        if view.content != content {
            view.content = content
            view.attributedText = RichMessageAttributedText.make(
                segments: content.segments,
                textStyle: content.textStyle,
                dynamicTypeSize: content.dynamicTypeSize,
                legibilityWeight: content.legibilityWeight,
                appearance: content.appearance
            )
            view.accessibilityLabel = RichMessageAttributedText
                .accessibilityLabel(for: content.segments)
            view.markRevision = markRevision
            return
        }
        guard view.markRevision != markRevision else { return }
        view.markRevision = markRevision
        view.setNeedsDisplay()
    }
}

/// The text view itself, which owns the pieces of behavior the transcript
/// depends on.
final class RichMessageUITextView: UITextView {
    var content: RichMessageTextView.Content?
    var markRevision = 0

    /// A long press on a row opens the transcript's own menu, which
    /// `TranscriptListView` vends from `UITableViewDelegate`. A selectable text
    /// view's loupe gesture sits on a nearer view and would swallow that press,
    /// so it is refused here. The tap that opens a link, double-tap word
    /// selection, its handles, and the edit menu they bring are untouched —
    /// only the press that belongs to the row is given back.
    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        if gestureRecognizer is UILongPressGestureRecognizer {
            return false
        }
        return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }

    /// A selection crosses the mentions, so a copy has to read like the
    /// sentence: without the spacers' attachment characters and without the
    /// word joiners holding each capsule to its own padding.
    override func copy(_ sender: Any?) {
        guard let range = selectedTextRange, let selected = text(in: range) else {
            return super.copy(sender)
        }
        UIPasteboard.general.string = RichMessageAttributedText.plainText(selected)
    }

    /// The body's words are real text now, so VoiceOver would read them once as
    /// this element's value and once more through the label that names each
    /// mention's kind. The label is the fuller reading, so it is the only one.
    override var accessibilityValue: String? {
        get { nil }
        set { super.accessibilityValue = newValue }
    }
}

/// What the body's links do when they are touched.
///
/// The text engine finds the link and decides the tap; this only says what the
/// tap means. A single tap hands the address to the system — a website or
/// pull-request chip, an ordinary anchor, a `mailto:` or `tel:` — and a long
/// press offers no menu of its own, because the press belongs to the row's
/// context menu, which `RichMessageUITextView` already refuses its own
/// recognizers for.
@MainActor
final class RichMessageLinkCoordinator: NSObject, UITextViewDelegate {
    func textView(
        _ textView: UITextView,
        primaryActionFor textItem: UITextItem,
        defaultAction: UIAction
    ) -> UIAction? {
        guard case .link(let url) = textItem.content else { return defaultAction }
        return UIAction { _ in
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
    }

    func textView(
        _ textView: UITextView,
        menuConfigurationFor textItem: UITextItem,
        defaultMenu: UIMenu
    ) -> UITextItem.MenuConfiguration? {
        nil
    }
}
#endif
