import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// A fenced code block: the App's secondary surface, the control corner, a
/// header naming the language with a copy control, and lines that scroll
/// sideways rather than wrap.
///
/// The text is fixed at its ideal size on both axes. A transcript cell is
/// first laid out at UIKit's placeholder height before self-sizing gives it
/// its real one, and a horizontal `ScrollView` hands that first height to its
/// content: an unfixed `Text` truncated to one line there and never re-measured,
/// so the row sized for every line while the plate drew one, centred in a tall
/// blank band.
struct RichMessageCodeBlockView: View {
    let language: String?
    let text: String
    let textStyle: Font.TextStyle

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RichMessageCodeBlockHeader(
                label: CodeFenceLanguage.label(forFence: language),
                text: text
            )
            RichMessageCodeBlockBody(text: text, textStyle: textStyle)
        }
        .background(
            HausPlatformColor.inputSurface,
            in: RoundedRectangle.haus(HausRadius.medium)
        )
        .clipShape(RoundedRectangle.haus(HausRadius.medium))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    static let inset: CGFloat = 12
    static let fadeWidth: CGFloat = 28
}

/// The plate's top row: the App's micro label (muted, small, uppercase, wide
/// tracking) for the language, and an icon-only copy control that swaps to a
/// checkmark for a moment once the code is on the pasteboard.
private struct RichMessageCodeBlockHeader: View {
    let label: String
    let text: String

    @State private var copiedAt: Date?

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.caption2.weight(.medium))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer(minLength: 0)
            Button(action: copy) {
                Image(systemName: copiedAt == nil ? "doc.on.doc" : "checkmark")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 32, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)
            .accessibilityLabel(copiedAt == nil ? "Copy code" : "Copied")
        }
        .padding(.leading, RichMessageCodeBlockView.inset)
        .padding(.trailing, 4)
        .padding(.top, 2)
        .sensoryFeedback(.success, trigger: copiedAt) { _, new in new != nil }
        .task(id: copiedAt) {
            guard copiedAt != nil else { return }
            try? await Task.sleep(for: .seconds(1.5))
            if !Task.isCancelled { copiedAt = nil }
        }
    }

    private func copy() {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #endif
        copiedAt = .now
    }
}

/// The code itself, scrolling sideways with a trailing fade while more of the
/// longest line is off to the right.
private struct RichMessageCodeBlockBody: View {
    let text: String
    let textStyle: Font.TextStyle

    /// How much wider the code runs than the plate shows, past where the
    /// reader has scrolled. Drives the trailing fade.
    @State private var hiddenTrailingWidth: CGFloat = 0

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(verbatim: text)
                .font(.system(textStyle, design: .monospaced))
                .fixedSize(horizontal: true, vertical: true)
                .textSelection(.enabled)
                .padding(.horizontal, RichMessageCodeBlockView.inset)
                .padding(.top, 2)
                .padding(.bottom, 9)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            geometry.contentSize.width - geometry.contentOffset.x - geometry.containerSize.width
        } action: { _, hidden in
            hiddenTrailingWidth = max(0, hidden)
        }
        // A soft trailing edge says there is more to the right; it lifts as
        // the reader reaches the end of the longest line.
        .mask {
            HStack(spacing: 0) {
                Rectangle()
                LinearGradient(
                    colors: [.black, .black.opacity(0)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: min(RichMessageCodeBlockView.fadeWidth, hiddenTrailingWidth))
            }
        }
    }
}
