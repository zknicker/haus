import HausModels
import SwiftUI

/// Which Agents are answering this Chat right now, just above its composer:
/// their avatars on the transcript's avatar rail, then a softly shimmering
/// line — the Agent's latest thought while one is up, "Juniper is typing"
/// otherwise. It takes space only while someone is answering, so the last
/// message rises to make room the way a reply would.
///
/// The screen owns the model, so the strip's state goes away with the Chat.
/// A foreground return reconnects, which re-reads the durable engagements.
struct ChatTypingStrip: View {
    let chatID: String
    let source: ChatEngagementSource

    @State private var model = ChatTypingModel()
    @State private var foregroundGeneration = 0
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let typists = ChatTypingLabel.typists(model.shownEngagements, resolve: source.typist)
        let label = ChatTypingLabel.text(typists.map(\.name))
        let thought = label == nil ? nil : model.shownThought

        VStack(spacing: 0) {
            if let label {
                ChatTypingRow(
                    typists: typists,
                    label: label,
                    thought: thought,
                    canRecall: model.canRecall,
                    onRecall: model.recall
                )
                .transition(
                    reduceMotion
                        ? .opacity
                        : .opacity.combined(with: .offset(y: 8))
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(reduceMotion ? .easeOut(duration: 0.2) : .smooth(duration: 0.32), value: label)
        .task(id: ConnectionKey(chatID: chatID, generation: foregroundGeneration)) {
            await source.connect(chatID, model)
        }
        .onChange(of: scenePhase) { previous, phase in
            // A stream that slept through the background may have missed an
            // end; reconnecting re-reads the durable state.
            if previous == .background, phase != .background { foregroundGeneration += 1 }
        }
    }

    private struct ConnectionKey: Hashable {
        let chatID: String
        let generation: Int
    }
}

/// The visible row: avatars, the shimmering line, and the typing dots.
private struct ChatTypingRow: View {
    static let maximumAvatars = 3

    let typists: [ChatTypist]
    let label: String
    let thought: ChatTypingThought?
    let canRecall: Bool
    let onRecall: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .subheadline) private var avatarSize: CGFloat = 22

    var body: some View {
        Button(action: onRecall) {
            HStack(spacing: 11) {
                avatars
                    // The transcript's 38pt avatar rail, so one typist sits
                    // under the avatars above it and the words on their column.
                    .frame(minWidth: 38)
                HStack(spacing: 6) {
                    line
                    if thought == nil { ChatTypingDots() }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .contentShape(.rect)
        }
        .buttonStyle(.pressableRow)
        .disabled(!canRecall)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(thought.map { "\(label). \($0.text)" } ?? label)
        .accessibilityHint(canRecall ? "Shows the latest thought again." : "")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var avatars: some View {
        HStack(spacing: -avatarSize * 0.3) {
            ForEach(typists.prefix(Self.maximumAvatars)) { typist in
                AvatarView(name: typist.name, url: typist.avatarURL, size: avatarSize)
                    .overlay {
                        Circle().strokeBorder(HausPlatformColor.background, lineWidth: 1.5)
                    }
            }
        }
    }

    /// The thought replaces the label while it is up; each new thought rises
    /// in, and the label returns when it leaves.
    private var line: some View {
        ZStack(alignment: .leading) {
            if let thought {
                // Thoughts run to about seven words; two lines, as on the App.
                ChatTypingShimmerText(text: thought.text, lineLimit: 2)
                    .id(thought.id)
                    .transition(lineTransition)
            } else {
                ChatTypingShimmerText(text: label)
                    .id(label)
                    .transition(lineTransition)
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.2) : .spring(duration: 0.5, bounce: 0.18), value: thought?.id)
        .animation(.easeOut(duration: 0.2), value: label)
    }

    private var lineTransition: AnyTransition {
        reduceMotion
            ? .opacity
            : .asymmetric(
                insertion: .opacity.combined(with: .offset(y: 6)).combined(with: .scale(scale: 0.97, anchor: .leading)),
                removal: .opacity.combined(with: .offset(y: -4))
            )
    }
}
