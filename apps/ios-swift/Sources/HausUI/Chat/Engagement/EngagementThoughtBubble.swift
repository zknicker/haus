import SwiftUI

/// One Agent thought, floating over the top of the transcript just under the
/// header: "**Blippy** Found a timing race on drawer open". One line, cut
/// with an ellipsis at a width that stays clear of the screen edges.
struct EngagementThoughtBubble: View {
    static let maximumWidth: CGFloat = 300

    let name: String
    let text: String

    var body: some View {
        let speaker = Text(name).fontWeight(.semibold).foregroundStyle(HausPlatformColor.label)
        return Text("\(speaker)  \(text)")
            .foregroundStyle(HausPlatformColor.secondaryLabel)
            .font(.footnote)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .glassEffect(.regular, in: .haus(HausRadius.large))
            .frame(maxWidth: Self.maximumWidth)
            .fixedSize(horizontal: false, vertical: true)
            // A bubble is over the transcript but is not a message: it grows
            // with text a little past the bar's cap, then stops.
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            // VoiceOver hears thoughts as polite announcements instead.
            .accessibilityHidden(true)
    }
}
