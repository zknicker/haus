import SwiftUI

/// Read-only details for the currently selected Chat.
///
/// This is deliberately a presentation of the existing Chat and Server
/// snapshots. It does not create a second participant or chat configuration
/// model on the device.
public struct ChatDetailsView: View {
    @Environment(\.dismiss) private var dismiss

    private let chat: ChatDestination
    private let server: ServerPresentation
    private let currentActivity: AgentActivityPresentation?
    private let loadAgentActivity: @Sendable (String) async throws -> [AgentActivityPresentation]
    private let agentProfile: (String) -> AgentProfilePresentation?
    private let onOpenAgentProfile: (String) -> Void
    @State private var historyState = ActivityHistoryState.idle
    @State private var path: [ChatDetailsRoute] = []
    @State private var detent = PresentationDetent.medium

    /// - Parameter agentProfile: the Server facts the Chat itself does not
    ///   carry — handle, description, runtime, model. Absent, the pushed
    ///   profile still shows identity and presence.
    /// - Parameter onOpenAgentProfile: hands the Agent id to the shell, which
    ///   dismisses this sheet and opens Settings on that Agent's profile. Only
    ///   the pushed profile's explicit "Manage in Settings" row uses it.
    public init(
        chat: ChatDestination,
        server: ServerPresentation,
        currentActivity: AgentActivityPresentation? = nil,
        loadAgentActivity: @escaping @Sendable (String) async throws -> [AgentActivityPresentation] = { _ in [] },
        agentProfile: @escaping (String) -> AgentProfilePresentation? = { _ in nil },
        onOpenAgentProfile: @escaping (String) -> Void = { _ in }
    ) {
        self.chat = chat
        self.server = server
        self.currentActivity = currentActivity
        self.loadAgentActivity = loadAgentActivity
        self.agentProfile = agentProfile
        self.onOpenAgentProfile = onOpenAgentProfile
    }

    public var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    hero
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

                // Same "About" shape as an Agent profile. A channel with no
                // description shows nothing rather than a placeholder.
                if let description = chat.durableChat?.description {
                    Section("About") {
                        Text(description)
                            .font(.body)
                            .foregroundStyle(.primary)
                    }
                }

                if case .agentDirectMessage(let agent) = chat.kind {
                    activitySections(agent: agent)
                }
            }
#if os(iOS)
            .listStyle(.insetGrouped)
#else
            .listStyle(.inset)
#endif
            .navigationTitle("")
            .hausInlineNavigationTitle()
            .navigationDestination(for: ChatDetailsRoute.self) { route in
                switch route {
                case .agentProfile(let agent):
                    AgentProfileDetailsView(
                        agent: agent,
                        profile: agentProfile(agent.id),
                        currentActivity: currentActivity,
                        onManageInSettings: { onOpenAgentProfile(agent.id) }
                    )
                }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationBackground(HausPlatformColor.groupedBackground)
        .task(id: agentID) { await loadHistory() }
        // A profile is a screenful of facts. The sheet grows to meet the push
        // rather than sliding a full screen into a half-height window, and it
        // stays large on the way back so returning is one animation, not two.
        .onChange(of: path.isEmpty) { _, isRoot in
            if !isRoot { detent = .large }
        }
    }

    /// The profile leads, so the activity section landing below it moves
    /// nothing. Nothing of the activity renders while its read is in flight:
    /// an unsettled read is not an empty one, so it appears once, with what it
    /// holds.
    @ViewBuilder
    private func activitySections(agent: AgentPresentation) -> some View {
        Section {
            // A real push, so the row's chevron is the stack's own and the
            // profile arrives on this surface instead of replacing it.
            NavigationLink(value: ChatDetailsRoute.agentProfile(agent)) {
                Label("View profile", systemImage: "person.crop.circle")
            }
            .accessibilityLabel("View \(agent.name)'s profile")
        }

        switch historyState {
        case .idle, .loading:
            EmptyView()
        case .failed:
            Section("Recent activity") {
                ContentUnavailableView(
                    "Activity unavailable",
                    systemImage: "clock.badge.exclamationmark"
                )
            }
        case .loaded(let events) where events.isEmpty:
            Section("Recent activity") {
                Text("No recent activity")
                    .foregroundStyle(.secondary)
            }
        case .loaded(let events):
            Section("Recent activity") {
                ForEach(events) { event in
                    HStack(spacing: 12) {
                        activityMark(event.state)
                            .foregroundStyle(event.state.color)
                            .frame(width: 22)
                        Text(event.title)
                        Spacer(minLength: 8)
                        Text(
                            event.occurredAt,
                            format: .relative(presentation: .numeric, unitsStyle: .abbreviated)
                        )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private var agentID: String? {
        guard case .agentDirectMessage(let agent) = chat.kind else { return nil }
        return agent.id
    }

    private func loadHistory() async {
        guard let agentID else { return }
        historyState = .loading
        do {
            historyState = .loaded(try await loadAgentActivity(agentID))
        } catch is CancellationError {
            return
        } catch {
            historyState = .failed
        }
    }

    private var hero: some View {
        VStack(spacing: 12) {
            chatIdentity

            VStack(spacing: 4) {
                Text(chat.title)
                    .font(.title2.weight(.semibold))
                statusLine
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
        .padding(.bottom, 4)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var statusLine: some View {
        switch chat.kind {
        case .channel:
            Text("Channel · \(server.name)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        case .agentDirectMessage(let agent):
            AgentStatusLine(presence: agent.presence, currentActivity: currentActivity)
        case .humanDirectMessage(let human):
            Text(human.handle.map { "Human · @\($0)" } ?? "Human")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var chatIdentity: some View {
        switch chat.kind {
        case .channel:
            // The hero sits where a DM's circular Agent avatar sits, so it keeps
            // the circle and only takes the channel's glyph and tint.
            ChannelIconBox(appearance: chat.appearance, size: 72, glyphSize: 32, shape: .circle)
        case .agentDirectMessage(let agent):
            AvatarView(
                name: agent.name,
                url: agent.avatarURL,
                presence: agent.presence,
                size: 72
            )
        case .humanDirectMessage(let human):
            AvatarView(name: human.name, url: human.avatarURL, presence: nil, size: 72)
        }
    }
}

/// Everything the details sheet can push to on its own stack.
enum ChatDetailsRoute: Hashable {
    case agentProfile(AgentPresentation)
}

private enum ActivityHistoryState {
    case idle
    case loading
    case loaded([AgentActivityPresentation])
    case failed
}

/// Work still running reads as a live dot; a settled state names itself.
@ViewBuilder
private func activityMark(_ state: AgentActivityState) -> some View {
    if let icon = state.icon {
        HausIcon(icon, size: 18, weight: 1.8)
    } else {
        Circle().frame(width: 9, height: 9)
    }
}

private extension AgentActivityState {
    var icon: HausIconName? {
        switch self {
        case .active: nil
        case .completed: .complete
        case .failed: .alert
        }
    }

    var color: Color {
        switch self {
        case .active: .yellow
        case .completed: .green
        case .failed: .gray
        }
    }
}

#Preview("Channel details") {
    ChatDetailsView(
        chat: .durableChat(ChatFixtures.chats[1]),
        server: ChatFixtures.server
    )
}

#Preview("Agent details") {
    ChatDetailsView(
        chat: .durableChat(ChatFixtures.chats[3]),
        server: ChatFixtures.server,
        agentProfile: { _ in
            AgentProfilePresentation(
                handle: "cove",
                description: "Onboards new Servers and keeps the plan tight.",
                runtime: "Claude Code",
                model: "claude-opus-4"
            )
        }
    )
}
