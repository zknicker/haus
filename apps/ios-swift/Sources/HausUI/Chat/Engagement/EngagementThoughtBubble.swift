import SwiftUI

/// One Agent thought, floating over the top of the transcript just under the
/// header: "**Blippy** Found a timing race on drawer open". One line, cut
/// with an ellipsis at a width that stays clear of the screen edges.
///
/// iOS 26 draws it in system glass; before that, the bar material with a
/// hairline and a soft shadow stands in, the way `ComposerGlassSurface` and
/// `GlassChromeButton` fall back.
struct EngagementThoughtBubble: View {
    static let maximumWidth: CGFloat = 300

    let name: String
    let text: String

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let speaker = Text(name).fontWeight(.semibold).foregroundStyle(HausPlatformColor.label)
        return Text("\(speaker)  \(text)")
            .foregroundStyle(HausPlatformColor.secondaryLabel)
            .font(.footnote)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .modifier(BubbleSurface(colorScheme: colorScheme))
            .frame(maxWidth: Self.maximumWidth)
            .fixedSize(horizontal: false, vertical: true)
            // A bubble is over the transcript but is not a message: it grows
            // with text a little past the bar's cap, then stops.
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            // VoiceOver hears thoughts as polite announcements instead.
            .accessibilityHidden(true)
    }
}

private struct BubbleSurface: ViewModifier {
    let colorScheme: ColorScheme

    func body(content: Content) -> some View {
        let shape = RoundedRectangle.haus(HausRadius.large)
        if #available(iOS 26, macOS 26, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content
                .background(.regularMaterial, in: shape)
                .overlay { shape.strokeBorder(HausPlatformColor.label.opacity(0.1), lineWidth: 0.5) }
                .shadow(color: .black.opacity(colorScheme == .dark ? 0.35 : 0.08), radius: 10, y: 3)
        }
    }
}
