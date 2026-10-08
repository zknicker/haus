import SwiftUI

/// The read-only Agent profile the Chat details sheet pushes to.
///
/// It lives inside the details sheet's own `NavigationStack`: the row that
/// reaches it wears a chevron, so it owes a push, not a sheet swap. Editing an
/// Agent still belongs to Settings, which the footer row escalates to
/// deliberately and by name.
struct AgentProfileDetailsView: View {
    let agent: AgentPresentation
    var profile: AgentProfilePresentation?
    var currentActivity: AgentActivityPresentation?
    var onManageInSettings: (() -> Void)?

    var body: some View {
        List {
            Section {
                hero
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            if let wakePause = profile?.wakePause {
                Section {
                    AgentWakePauseNotice(pause: wakePause)
                }
            }

            if let about = profile?.about {
                Section("About") {
                    Text(about)
                        .font(.body)
                        .foregroundStyle(.primary)
                }
            }

            if let fields = profile?.detailFields, !fields.isEmpty {
                Section("Details") {
                    ForEach(fields) { field in
                        LabeledContent(field.title) {
                            Text(field.value)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            if let onManageInSettings {
                Section {
                    Button(action: onManageInSettings) {
                        HStack(spacing: 12) {
                            Label("Manage in Settings", systemImage: "gearshape")
                                .foregroundStyle(.primary)
                            Spacer(minLength: 8)
                            // Deliberately not a chevron: this one really does
                            // leave the sheet for another surface.
                            Image(systemName: "arrow.up.forward")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.tertiary)
                                .accessibilityHidden(true)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Manage \(agent.name) in Settings")
                }
            }
        }
#if os(iOS)
        .listStyle(.insetGrouped)
#else
        .listStyle(.inset)
#endif
        .navigationTitle(agent.name)
        .hausInlineNavigationTitle()
    }

    private var hero: some View {
        VStack(spacing: 12) {
            AvatarView(
                name: agent.name,
                url: agent.avatarURL,
                presence: agent.presence,
                size: 72
            )

            VStack(spacing: 4) {
                Text(agent.name)
                    .font(.title2.weight(.semibold))
                if let handle = profile?.displayHandle {
                    Text(handle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                AgentStatusLine(presence: agent.presence, currentActivity: currentActivity)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
        .padding(.bottom, 4)
        .accessibilityElement(children: .combine)
    }
}

/// What the Agent is doing right now, or what it is when it is doing nothing.
/// It is words only: the avatar above it already wears the presence dot, and a
/// second dot beside "Online" said the same thing twice.
struct AgentStatusLine: View {
    let presence: AgentPresence
    var currentActivity: AgentActivityPresentation?

    var body: some View {
        HStack(spacing: 6) {
            Text(currentActivity?.title ?? presence.activityTitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if currentActivity != nil {
                ProgressView().controlSize(.mini)
            }
        }
    }
}

extension AgentPresence {
    var activityTitle: String {
        switch self {
        case .idle: "Online"
        case .working: "Working"
        case .error: "Error"
        case .offline: "Offline"
        case .stopped: "Stopped"
        }
    }
}

#Preview("Agent profile") {
    NavigationStack {
        AgentProfileDetailsView(
            agent: ChatFixtures.cove,
            profile: AgentProfilePresentation(
                handle: "cove",
                description: "Onboards new Servers and keeps the plan tight.",
                runtime: "Claude Code",
                model: "claude-opus-4"
            ),
            onManageInSettings: {}
        )
    }
}

#Preview("Agent profile without Server facts") {
    NavigationStack {
        AgentProfileDetailsView(agent: ChatFixtures.cove)
    }
}
