import SwiftUI
#if os(iOS)
import UIKit
#endif

/// The composer's text input. On iPhone it is `ComposerTextView`, so a picked
/// mention shows as the transcript's chip while the draft stays Markdown; the
/// macOS build that runs `swift test` keeps the plain field.
struct ComposerMessageInput: View {
    @Binding var text: String
    let options: [MentionOptionPresentation]
    let label: String

    var body: some View {
        #if os(iOS)
        ComposerTextView(text: $text, options: options, accessibilityLabel: label)
        #else
        TextField("", text: $text, axis: .vertical)
            .foregroundStyle(.primary)
            .lineLimit(1...6)
        #endif
    }
}

#if os(iOS)

/// The composer's text field: an editable `UITextView` over the same TextKit 1
/// stack the transcript body uses, so a picked mention reads as the
/// transcript's own chip — mark, label, dotted rule — rather than as the
/// `[@Blippy](agent://…)` Markdown the draft carries.
///
/// The binding stays Markdown. `ComposerDraftText` turns it into the shown
/// text and back, a chip edits as one piece, and anything written to the
/// binding from outside — a picker insertion, the clear on send, a restored
/// draft — rebuilds the shown text.
///
/// Focus is the caller's `.focused(_:)` on this view, exactly as it was on the
/// `TextField` this replaced: SwiftUI drives a hosted text view's first
/// responder status itself. Bridging it by hand as well fought that bridge —
/// each side undid the other's change and the keyboard never settled.
struct ComposerTextView: UIViewRepresentable {
    @Binding var text: String
    let options: [MentionOptionPresentation]
    let accessibilityLabel: String
    /// The field grows with its text up to this many lines, then scrolls.
    var maximumLines = 6

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.legibilityWeight) private var legibilityWeight

    func makeCoordinator() -> ComposerTextCoordinator { ComposerTextCoordinator() }

    func makeUIView(context: Context) -> ComposerUITextView {
        let storage = NSTextStorage()
        let layoutManager = RichReferenceLayoutManager()
        let container = NSTextContainer(
            size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
        )
        container.lineFragmentPadding = 0
        container.widthTracksTextView = true
        layoutManager.addTextContainer(container)
        storage.addLayoutManager(layoutManager)

        let view = ComposerUITextView(frame: .zero, textContainer: container)
        layoutManager.claimLineBreaking()
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.dataDetectorTypes = []
        // The chip carries its own ink; the field's text is never a link.
        view.linkTextAttributes = [:]
        view.adjustsFontForContentSizeCategory = false
        view.showsVerticalScrollIndicator = false
        view.delegate = context.coordinator
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        context.coordinator.parent = self
        apply(to: view, coordinator: context.coordinator)
        return view
    }

    func updateUIView(_ view: ComposerUITextView, context: Context) {
        context.coordinator.parent = self
        apply(to: view, coordinator: context.coordinator)
    }

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        uiView: ComposerUITextView,
        context: Context
    ) -> CGSize? {
        let width = proposal.width.flatMap { $0.isFinite && $0 > 0 ? $0 : nil } ?? 240
        let fitted = uiView.sizeThatFits(
            CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
        )
        let lineHeight = context.coordinator.font?.lineHeight ?? fitted.height
        let cap = ceil(lineHeight * CGFloat(maximumLines))
        return CGSize(width: width, height: min(ceil(fitted.height), cap))
    }

    private func apply(to view: ComposerUITextView, coordinator: ComposerTextCoordinator) {
        let font = PlatformTextMetrics.font(
            for: .body,
            dynamicTypeSize: dynamicTypeSize,
            legibilityWeight: legibilityWeight
        )
        // Compared by what draws, not by object: every resolution is a new font.
        let styleChanged = coordinator.font?.fontDescriptor != font.fontDescriptor
        guard styleChanged || coordinator.isExternal(text) else { return }
        coordinator.font = font
        coordinator.adoptExternal(text)
        view.accessibilityLabel = accessibilityLabel
        let pieces = ComposerDraftText.pieces(markdown: text, options: options)
        view.attributedText = ComposerDraftText.attributed(
            pieces,
            font: font,
            metrics: PlatformTextMetrics.metrics(of: font)
        )
        view.typingAttributes = ComposerDraftText.bodyAttributes(font: font)
        // A rebuild comes from outside the field — a picked mention, a send, a
        // restored draft — and in every case the next word belongs at the end.
        view.selectedRange = NSRange(location: view.textStorage.length, length: 0)
        coordinator.loadAvatars(in: pieces, for: view)
    }
}

final class ComposerUITextView: UITextView {
    /// A selection crosses the chips, so a copy reads as the sentence: the
    /// words a chip draws, never its spacer or its Markdown target.
    override func copy(_ sender: Any?) {
        guard let range = selectedTextRange, let selected = text(in: range) else {
            return super.copy(sender)
        }
        UIPasteboard.general.string = RichMessageAttributedText.plainText(selected)
    }
}

/// Keeps the shown text and the Markdown binding in step, and makes a chip
/// behave as one piece of text.
@MainActor
final class ComposerTextCoordinator: NSObject, UITextViewDelegate {
    var parent: ComposerTextView?
    var font: UIFont?
    private var echoes = ComposerDraftEchoes()

    func isExternal(_ value: String) -> Bool {
        echoes.isExternal(value)
    }

    func adoptExternal(_ value: String) {
        echoes.adopt(value)
    }

    /// An edit that reaches into a chip takes the whole chip: a backspace
    /// after one deletes it, and typing over part of one replaces it.
    func textView(
        _ textView: UITextView,
        shouldChangeTextIn range: NSRange,
        replacementText replacement: String
    ) -> Bool {
        let expanded = ComposerDraftText.expandingToChips(range, in: textView.textStorage)
        guard expanded != range, let font else { return true }
        textView.textStorage.replaceCharacters(
            in: expanded,
            with: NSAttributedString(
                string: replacement,
                attributes: ComposerDraftText.bodyAttributes(font: font)
            )
        )
        textView.selectedRange = NSRange(
            location: expanded.location + (replacement as NSString).length,
            length: 0
        )
        textViewDidChange(textView)
        return false
    }

    func textViewDidChange(_ textView: UITextView) {
        let next = ComposerDraftText.markdown(from: textView.attributedText)
        guard echoes.report(next) else { return }
        parent?.text = next
    }

    /// A caret never rests inside a chip, and typing after a chip writes plain
    /// words rather than inheriting the chip's ink and identity.
    func textViewDidChangeSelection(_ textView: UITextView) {
        let selection = textView.selectedRange
        if selection.length == 0 {
            let snapped = ComposerDraftText.caretOutsideChips(
                selection.location,
                in: textView.textStorage
            )
            if snapped != selection.location {
                textView.selectedRange = NSRange(location: snapped, length: 0)
            }
        }
        // Only when the caret would inherit a chip's attributes: writing
        // `typingAttributes` on every keystroke desynchronizes the keyboard's
        // own view of the text, and it drops characters.
        if let font, ComposerDraftText.carriesChip(textView.typingAttributes) {
            textView.typingAttributes = ComposerDraftText.bodyAttributes(font: font)
        }
    }

    /// The text holds no image for an avatar it has not loaded yet; the mark
    /// is painted from `AvatarImageCache` at draw time, so a landed avatar
    /// only needs a repaint.
    func loadAvatars(in pieces: [ComposerDraftText.Piece], for view: UITextView) {
        let urls = pieces.compactMap { piece -> URL? in
            guard case .chip(_, let reference) = piece else { return nil }
            return reference.avatarURL
        }
        let missing = urls.filter { AvatarImageCache.shared.image(for: $0) == nil }
        guard !missing.isEmpty else { return }
        Task { @MainActor [weak view] in
            for url in missing {
                _ = await AvatarImageCache.shared.load(url: url)
            }
            view?.setNeedsDisplay()
        }
    }
}
#endif
