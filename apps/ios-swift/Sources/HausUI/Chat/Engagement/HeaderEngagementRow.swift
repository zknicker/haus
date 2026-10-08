import HausModels
import SwiftUI

/// The compact row under the header title while Agents answer the Chat.
///
/// In a channel it is the working Agents' mini avatars, overlapped and ringed
/// in the header's ground, then the typing dots; the Agent whose bubble is up
/// lifts slightly. In a DM it is the Agent's latest thought as a one-line
/// subtitle, crossfading as thoughts change, with the dots trailing. It shows
/// no "is typing" words — VoiceOver reads it as one element instead.
struct HeaderEngagementRow: View {
    static let maximumAvatars = 3
    static let maximumWidth: CGFloat = 300
    /// The row's height at the default text size.
    static let rowHeight: CGFloat = 22

    let style: HeaderEngagementStyle
    let typists: [ChatTypist]
    let speakingAgentID: String?
    let thought: ChatTypingThought?
    let label: String
    let onOpen: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .caption) private var avatarSize: CGFloat = 18

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 6) {
                switch style {
                case .roster: avatars
                case .subtitle: subtitle
                }
                EngagementDots()
            }
            .padding(.horizontal, 10)
            // Wide enough for a thought, narrow enough to stay clear of the
            // screen edges; a longer line truncates rather than the title.
            .frame(maxWidth: Self.maximumWidth)
            .frame(minHeight: Self.rowHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.pressable)
        // Like the header it hangs from, the row stops growing past the
        // largest standard size; Working now carries the words at any size.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(thought?.text ?? "")
        .accessibilityHint("Shows what they’re working on.")
        .accessibilityAddTraits([.isButton, .updatesFrequently])
    }

    private var avatars: some View {
        let shown = typists.prefix(Self.maximumAvatars)
        let overflow = typists.count - shown.count
        return HStack(spacing: -avatarSize * 0.28) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, typist in
                let speaking = typist.id == speakingAgentID && !reduceMotion
                AvatarView(name: typist.name, url: typist.avatarURL, size: avatarSize)
                    .padding(1.5)
                    .background(.bar, in: .circle)
                    .scaleEffect(speaking ? 1.14 : 1)
                    .offset(y: speaking ? -1.5 : 0)
                    // Later avatars tuck under earlier ones, except the one speaking.
                    .zIndex(speaking ? 10 : Double(shown.count - index))
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
            if overflow > 0 {
                Text("+\(overflow)")
                    .font(.caption2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.leading, avatarSize * 0.28 + 3)
            }
        }
        .animation(.spring(duration: 0.4, bounce: 0.25), value: speakingAgentID)
        .animation(.spring(duration: 0.4, bounce: 0.15), value: typists.map(\.id))
    }

    /// The thought line, or nothing before the first thought arrives — then
    /// the row is only the dots.
    private var subtitle: some View {
        ZStack {
            if let thought {
                Text(thought.text)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .id(thought.id)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: reduceMotion ? 0.2 : 0.35), value: thought?.id)
    }
}
