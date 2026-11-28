import SwiftUI

/// The Server's Projects and their setup: key and default Machine. Blank
/// until `project.list` lands; a failed first read says so.
struct ProjectsSettingsView: View {
    let projects: [SettingsProject]?
    let reload: @Sendable () async throws -> Void
    let onOpen: (String) -> Void

    @State private var failure: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let projects {
                    SettingsListGroup {
                        if projects.isEmpty {
                            AutomationNote("No Projects yet.")
                        }
                        ForEach(projects) { project in
                            DisclosureRow(
                                project.name,
                                value: project.key,
                                icon: .channel,
                                showsDivider: project.id != projects.last?.id
                            ) { onOpen(project.id) }
                        }
                    }
                } else if let failure {
                    SettingsListGroup { AutomationNote(failure) }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
        .navigationTitle("Projects")
        .hausInlineNavigationTitle()
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            try await reload()
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            failure = "Unable to load Projects."
        }
    }
}

/// One Project's setup, read-only on the phone.
struct ProjectSettingsDetailView: View {
    let project: SettingsProject

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsListGroup {
                    if !project.key.isEmpty {
                        ValueRow("Key", value: project.key, icon: .handle)
                    }
                    ValueRow(
                        "Default Machine",
                        value: project.defaultMachine ?? "No default",
                        icon: .computer,
                        showsDivider: false
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
        .navigationTitle(project.name)
        .hausInlineNavigationTitle()
    }
}

#Preview("Projects") {
    NavigationStack {
        ProjectsSettingsView(projects: SettingsFixtures.projects, reload: {}, onOpen: { _ in })
    }
}

#Preview("Project") {
    NavigationStack {
        ProjectSettingsDetailView(project: SettingsFixtures.projects[0])
    }
}
