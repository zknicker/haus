import HausModels
import SwiftUI

/// How the header tells who is answering. A Project names its working Captains with their marks;
/// a DM's title already names its Captain, so its pill is the thought alone.
public enum HeaderEngagementStyle: Sendable, Equatable {
    case roster
    case subtitle
}

/// Live work in the Chat header (ADR 0035, 0036; `specs/ios-app.md`): the dots and glass thought
/// pill centered under the identity. It is an overlay on the header, never a transcript row, so
/// it comes and goes without moving the transcript.
///
/// It owns the Chat's `ChatTypingModel` and its live connection, so the state goes away with the
/// Chat; a foreground return reconnects, which re-reads the durable engagements. Tapping the pill,
/// or setting `turnDetails` from a message's "View turn details", opens turn details.
struct HeaderEngagement: View {
    let chatID: String
    let style: HeaderEngagementStyle
    /// Under a system navigation bar the pill keeps clear of its edge.
    var underNavigationBar = false
    /// Set by a message's "View turn details"; the pill's own tap needs none.
    var turnDetails: Binding<TurnDetailsFocus?>?

    @Environment(\.chatEngagementSource) private var source

    var body: some View {
        if let source {
            HeaderEngagementContent(chatID: chatID, style: style, source: source, turnDetails: turnDetails)
                .padding(.top, underNavigationBar ? 6 : 0)
                .id(chatID)
        }
    }
}

private struct HeaderEngagementContent: View {
    let chatID: String
    let style: HeaderEngagementStyle
    let source: ChatEngagementSource
    let turnDetails: Binding<TurnDetailsFocus?>?

    @State private var tapped: TurnDetailsFocus?
    @State private var model = ChatTypingModel()
    @State private var foregroundGeneration = 0
    @State private var announcer = EngagementAnnouncer()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.shellChrome) private var shellChrome

    var body: some View {
        let typists = ChatTypingLabel.typists(model.shownEngagements, resolve: source.typist)
        let label = ChatTypingLabel.text(typists.map(\.name))
        let thought = latestThought(of: typists)

        ZStack {
            if let label {
                HeaderEngagementRow(
                    style: style,
                    typists: typists,
                    thought: thought,
                    label: label,
                    onOpen: { openTurnDetails(typists) }
                )
                .transition(rowTransition)
            }
        }
        .frame(maxWidth: .infinity, alignment: shellChrome == .stock ? .leading : .center)
        .animation(reduceMotion ? .easeOut(duration: 0.2) : .smooth(duration: 0.32), value: label)
        .sheet(item: turnDetailsPresented) { focus in
            if let turnSource = source.turnDetails {
                TurnDetailsSheet(
                    focus: focus,
                    source: turnSource,
                    typist: source.typist,
                    thought: { model.latestThought(for: $0)?.text }
                )
            }
        }
        .onChange(of: thought?.id) { _, _ in
            if let thought {
                let name = typists.first { $0.id == thought.agentID }?.name
                announcer.announce(style == .roster ? [name, thought.text].compactMap(\.self).joined(separator: ": ") : thought.text)
            }
        }
        .task(id: ConnectionKey(chatID: chatID, generation: foregroundGeneration)) {
            await source.connect(chatID, model)
        }
        .onChange(of: scenePhase) { previous, phase in
            // A stream that slept through the background may have missed an end; reconnecting
            // re-reads the durable state.
            if previous == .background, phase != .background { foregroundGeneration += 1 }
        }
    }

    /// The sheet opens only where the App gave turn details a source.
    private var turnDetailsPresented: Binding<TurnDetailsFocus?> {
        Binding(
            get: { source.turnDetails == nil ? nil : turnDetails?.wrappedValue ?? tapped },
            set: { focus in
                tapped = focus
                turnDetails?.wrappedValue = focus
            }
        )
    }

    private func openTurnDetails(_ typists: [ChatTypist]) {
        guard !typists.isEmpty else { return }
        tapped = TurnDetailsFocus(agentIDs: typists.map(\.id))
    }

    /// The newest line any shown Captain has thought.
    private func latestThought(of typists: [ChatTypist]) -> ChatTypingThought? {
        typists.compactMap { model.latestThought(for: $0.id) }.max { $0.id < $1.id }
    }

    /// The pill opens out of the identity above it.
    private var rowTransition: AnyTransition {
        reduceMotion
            ? .opacity
            : .opacity.combined(with: .scale(scale: 0.85, anchor: .top)).combined(with: .offset(y: -6))
    }

    private struct ConnectionKey: Hashable {
        let chatID: String
        let generation: Int
    }
}
