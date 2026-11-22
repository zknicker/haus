import HausModels
import SwiftUI

/// The glass thought pill under the header identity while Captains answer the Chat: the dots,
/// then the newest thought. In a Project it leads with the working Captains' marks and, before a
/// thought arrives, names them. VoiceOver reads it as one element.
struct HeaderEngagementRow: View {
    static let maximumMarks = 3
    static let maximumWidth: CGFloat = 300
    /// The pill's height at the default text size.
    static let rowHeight: CGFloat = 28

    let style: HeaderEngagementStyle
    let typists: [ChatTypist]
    let thought: ChatTypingThought?
    let label: String
    let onOpen: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .caption) private var markSide: CGFloat = 16

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 8) {
                if style == .roster { marks }
                EngagementDots()
                text
            }
            .padding(.horizontal, 12)
            .frame(minHeight: Self.rowHeight)
            .glassEffect(.regular, in: .capsule)
            .frame(maxWidth: Self.maximumWidth)
            .fixedSize(horizontal: false, vertical: true)
            .contentShape(.capsule)
        }
        .buttonStyle(.pressable)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(thought?.text ?? "")
        .accessibilityHint("Shows turn details.")
        .accessibilityAddTraits([.isButton, .updatesFrequently])
    }

    private var marks: some View {
        let shown = typists.prefix(Self.maximumMarks)
        let overflow = typists.count - shown.count
        return HStack(spacing: -markSide * 0.25) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, typist in
                CaptainAvatarMark(name: typist.name, url: typist.avatarURL, side: markSide)
                    .zIndex(Double(shown.count - index))
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
            if overflow > 0 {
                Text("+\(overflow)")
                    .font(.caption2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .padding(.leading, markSide * 0.25 + 3)
            }
        }
        .animation(.spring(duration: 0.4, bounce: 0.15), value: typists.map(\.id))
    }

    /// The newest thought, crossfading as thoughts change. Before the first one a Project names
    /// its working Captains and a DM shows the dots alone.
    private var text: some View {
        ZStack(alignment: .leading) {
            if let line = thought?.text ?? (style == .roster ? ChatTypingLabel.names(typists.map(\.name)) : nil) {
                Text(line)
                    .font(.footnote)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .id(line)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: reduceMotion ? 0.2 : 0.35), value: thought?.id)
    }
}
