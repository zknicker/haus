import SwiftUI

/// A Server-wide destination that is a screen rather than a chat — Tasks today.
/// It wears the Inbox row's shape: a glyph in the sidebar's common column, a
/// label, and the row capsule.
///
/// Its glyph is a boxed icon's share of that column, not the anchor mark's. The
/// Inbox ghost sits a size above these on purpose, on the phone and in the App
/// alike: it names the product, where these name a screen.
struct SidebarUtilityRow: View {
    let title: String
    let icon: HausIconName
    let glyphColumn: CGFloat
    let capsuleBleed: CGFloat
    let action: () -> Void

    /// The family's own 1.5 reads thin against a row's body text.
    private static let glyphWeight: CGFloat = 1.8

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                // A bare glyph has no box behind it to hold the column the way
                // a channel's tinted box or an Agent's avatar does, so it takes
                // a larger share of it than `ChannelIconBox` gives its own
                // boxed glyph. `HausIcon` reads this as a font size, so a wide
                // glyph still fits the column.
                HausIcon(icon, size: (glyphColumn * 0.8).rounded(), weight: Self.glyphWeight)
                    .frame(width: glyphColumn, height: glyphColumn)
                Text(title)
                Spacer(minLength: 0)
            }
            .foregroundStyle(.primary)
            .padding(.horizontal, capsuleBleed)
            .frame(height: 42)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow)
    }
}
