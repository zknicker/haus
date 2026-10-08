import HausModels
import SwiftUI

/// How the header tells who is answering. A channel shows the working
/// Agents' avatars and drops their thoughts as bubbles; a DM's title already
/// names its Agent, so the row is the thought itself as a subtitle.
public enum HeaderEngagementStyle: Sendable, Equatable {
    case roster
    case subtitle
}

/// Who is answering the open Chat, hung just under its header title (ADR
/// 0035, 0036). It is an overlay on the header, never a row in the layout, so
/// it comes and goes without moving the transcript scrolling beneath it.
///
/// It owns the Chat's `ChatTypingModel` and its live connection, so the
/// state goes away with the Chat; a foreground return reconnects, which
/// re-reads the durable engagements. Tapping the row opens Working now;
/// bubbles pass touches through to the transcript.
struct HeaderEngagement: View {
    let chatID: String
    let style: HeaderEngagementStyle
    /// Under a system navigation bar, which draws no material, the row's
    /// frosted ground reaches up to the screen top.
    var underNavigationBar = false

    @Environment(\.chatEngagementSource) private var source

    var body: some View {
        if let source {
            HeaderEngagementContent(chatID: chatID, style: style, underNavigationBar: underNavigationBar, source: source)
                .id(chatID)
        }
    }
}

private struct HeaderEngagementContent: View {
    let chatID: String
    let style: HeaderEngagementStyle
    let underNavigationBar: Bool
    let source: ChatEngagementSource

    @State private var model = ChatTypingModel()
    @State private var foregroundGeneration = 0
    @State private var isShowingWorkingNow = false
    @State private var announcer = EngagementAnnouncer()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let typists = ChatTypingLabel.typists(model.shownEngagements, resolve: source.typist)
        let label = ChatTypingLabel.text(typists.map(\.name))
        let bubble = style == .roster ? model.bubble.flatMap { thought in
            typists.first { $0.id == thought.agentID }.map { ShownBubble(thought: thought, typist: $0) }
        } : nil
        let subtitle = style == .subtitle ? latestThought(of: typists) : nil

        VStack(spacing: 8) {
            ZStack {
                if let label {
                    HeaderEngagementRow(
                        style: style,
                        typists: typists,
                        speakingAgentID: bubble?.thought.agentID,
                        thought: subtitle,
                        label: label,
                        onOpen: { isShowingWorkingNow = true }
                    )
                    .transition(rowTransition)
                }
            }
            .frame(maxWidth: .infinity)
            .background {
                if label != nil {
                    HeaderEngagementBackdrop(reachesScreenTop: underNavigationBar).transition(.opacity)
                }
            }
            ZStack {
                if let bubble {
                    EngagementThoughtBubble(name: bubble.typist.name, text: bubble.thought.text)
                        .id(bubble.thought.id)
                        .transition(bubbleTransition)
                        // A bubble floats over the transcript for a moment;
                        // it must never take a tap meant for a message under it.
                        .allowsHitTesting(false)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .animation(reduceMotion ? .easeOut(duration: 0.2) : .smooth(duration: 0.32), value: label)
        .animation(reduceMotion ? .easeInOut(duration: 0.25) : .spring(duration: 0.45, bounce: 0.18), value: bubble?.thought.id)
        .sheet(isPresented: $isShowingWorkingNow) {
            WorkingNowSheet(model: model, source: source)
        }
        .onChange(of: bubble?.thought.id) { _, _ in
            if let bubble { announcer.announce("\(bubble.typist.name): \(bubble.thought.text)") }
        }
        .onChange(of: subtitle?.id) { _, _ in
            if let subtitle { announcer.announce(subtitle.text) }
        }
        .task(id: ConnectionKey(chatID: chatID, generation: foregroundGeneration)) {
            await source.connect(chatID, model)
        }
        .onChange(of: scenePhase) { previous, phase in
            // A stream that slept through the background may have missed an
            // end; reconnecting re-reads the durable state.
            if previous == .background, phase != .background { foregroundGeneration += 1 }
        }
    }

    /// The DM subtitle: the newest line any shown Agent has thought.
    private func latestThought(of typists: [ChatTypist]) -> ChatTypingThought? {
        typists.compactMap { model.latestThought(for: $0.id) }.max { $0.id < $1.id }
    }

    /// The row opens out of the title above it.
    private var rowTransition: AnyTransition {
        reduceMotion
            ? .opacity
            : .opacity.combined(with: .scale(scale: 0.85, anchor: .top)).combined(with: .offset(y: -6))
    }

    /// A bubble drops from under the row, then lifts away and fades; under
    /// Reduce Motion it crossfades in place.
    private var bubbleTransition: AnyTransition {
        reduceMotion
            ? .opacity
            : .asymmetric(
                insertion: .opacity
                    .combined(with: .offset(y: -12))
                    .combined(with: .scale(scale: 0.94, anchor: .top)),
                removal: .opacity.combined(with: .offset(y: -10)).combined(with: .scale(scale: 0.97, anchor: .top))
            )
    }

    private struct ShownBubble {
        let thought: ChatTypingThought
        let typist: ChatTypist
    }

    private struct ConnectionKey: Hashable {
        let chatID: String
        let generation: Int
    }
}

/// The quiet ground under the row: a band of the bar material, so a message
/// scrolling behind the row never reads through it. Under the Chat header it
/// feathers in from the header's own frost; under a system navigation bar,
/// which draws no material of its own, it reaches up to the screen top.
///
/// The feathers are fixed lengths in the band's padding, never fractions of
/// its height: a band that reaches the screen top is several times taller
/// than the row, and a proportional fade put the row itself in the fade,
/// where messages read straight through it.
private struct HeaderEngagementBackdrop: View {
    static let topFeather: CGFloat = 12
    static let bottomFeather: CGFloat = 16

    let reachesScreenTop: Bool

    var body: some View {
        Rectangle()
            .fill(.bar)
            .mask {
                VStack(spacing: 0) {
                    if !reachesScreenTop {
                        feather(from: .clear, to: .black).frame(height: Self.topFeather)
                    }
                    Rectangle()
                    feather(from: .black, to: .clear).frame(height: Self.bottomFeather)
                }
            }
            .padding(.top, reachesScreenTop ? 0 : -Self.topFeather)
            .padding(.bottom, -Self.bottomFeather)
            .ignoresSafeArea(edges: reachesScreenTop ? .top : [])
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private func feather(from start: Color, to end: Color) -> some View {
        LinearGradient(colors: [start, end], startPoint: .top, endPoint: .bottom)
    }
}
