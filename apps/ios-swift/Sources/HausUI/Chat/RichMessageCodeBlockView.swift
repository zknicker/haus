import SwiftUI

/// A fenced code block: the App's secondary surface, the control corner, and
/// lines that scroll sideways rather than wrap.
///
/// The text is fixed at its ideal size on both axes. A transcript cell is
/// first laid out at UIKit's placeholder height before self-sizing gives it
/// its real one, and a horizontal `ScrollView` hands that first height to its
/// content: an unfixed `Text` truncated to one line there and never re-measured,
/// so the row sized for every line while the plate drew one, centred in a tall
/// blank band.
struct RichMessageCodeBlockView: View {
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
                .padding(.horizontal, Self.inset)
                .padding(.vertical, 9)
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
                .frame(width: min(Self.fadeWidth, hiddenTrailingWidth))
            }
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
