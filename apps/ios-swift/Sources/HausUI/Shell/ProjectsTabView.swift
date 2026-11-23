import SwiftUI

/// What the Projects tab does with a row.
public struct ProjectsTabActions {
    let open: (String) -> Void
    let markRead: (String) -> Void
    let openDetails: (String) -> Void
    let openSettings: (String) -> Void
    let openArchived: () -> Void
    let newProject: () -> Void
    let refresh: () async -> Void

    /// - Parameters:
    ///   - open: a Project's or a DM's Chat id.
    ///   - openSettings: a Project's id.
    public init(
        open: @escaping (String) -> Void,
        markRead: @escaping (String) -> Void,
        openDetails: @escaping (String) -> Void,
        openSettings: @escaping (String) -> Void,
        openArchived: @escaping () -> Void,
        newProject: @escaping () -> Void,
        refresh: @escaping () async -> Void
    ) {
        self.open = open
        self.markRead = markRead
        self.openDetails = openDetails
        self.openSettings = openSettings
        self.openArchived = openArchived
        self.newProject = newProject
        self.refresh = refresh
    }
}

/// The Projects tab's root: the joined Projects with their Captains, open
/// Task counts, and unread dots, then `#all`, People, and Archived.
public struct ProjectsTabView: View {
    private let projects: [ProjectRowPresentation]
    private let people: [PersonRowPresentation]
    private let captains: [CaptainIdentity]
    private let archivedCount: Int?
    private let isLoaded: Bool
    private let actions: ProjectsTabActions

    @State private var filter = ProjectsFilter()

    public init(
        projects: [ProjectRowPresentation],
        people: [PersonRowPresentation],
        captains: [CaptainIdentity],
        archivedCount: Int?,
        isLoaded: Bool,
        actions: ProjectsTabActions
    ) {
        self.projects = projects
        self.people = people
        self.captains = captains
        self.archivedCount = archivedCount
        self.isLoaded = isLoaded
        self.actions = actions
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            list(now: context.date)
        }
        .scrollContentBackground(.hidden)
        .background(HausPlatformColor.canvas)
        .refreshable { await actions.refresh() }
        .task { await actions.refresh() }
        .hausScreenTitle("Projects")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New project", systemImage: "plus", action: actions.newProject)
                    .hausHeaderGlyph()
            }
        }
    }

    private func list(now: Date) -> some View {
        let shown = filter.apply(projects)
        return List {
            ProjectsFilterChips(filter: $filter, captains: captains)
                .padding(.vertical, 8)
                .hausPlainRow(margin: 0)
            if isLoaded, shown.isEmpty {
                emptyProjects.hausPlainRow()
            }
            ForEach(shown) { project in
                Button { actions.open(project.chatID) } label: { ProjectRow(row: project, now: now) }
                    .buttonStyle(.plain)
                    .hausPlainRow()
                    .contextMenu { menu(for: project) }
                    .swipeActions(edge: .trailing) { markReadButton(project.isUnread ? project.chatID : nil) }
            }
            if !people.isEmpty, !filter.isNarrowed {
                SectionCountLabel("People", count: people.count).hausSectionLabelRow()
                ForEach(people) { person in
                    Button { actions.open(person.chatID) } label: { PersonRow(row: person) }
                        .buttonStyle(.plain)
                        .hausPlainRow()
                        .contextMenu { markReadButton(person.isUnread ? person.chatID : nil) }
                        .swipeActions(edge: .trailing) { markReadButton(person.isUnread ? person.chatID : nil) }
                }
            }
            if isLoaded, !filter.isNarrowed, archivedCount != 0 {
                Button(action: actions.openArchived) { ArchivedProjectsRow(count: archivedCount) }
                    .buttonStyle(.plain)
                    .padding(.top, 20)
                    .hausPlainRow()
            }
        }
        .listStyle(.plain)
        .reportsChromeScroll()
        .environment(\.defaultMinListRowHeight, 0)
        .animation(.snappy(duration: 0.35), value: shown)
    }

    @ViewBuilder
    private func menu(for project: ProjectRowPresentation) -> some View {
        markReadButton(project.isUnread ? project.chatID : nil)
        Button("Project details", systemImage: "info.circle") { actions.openDetails(project.chatID) }
        if let projectID = project.projectID, !project.isAll {
            Button("Project settings", systemImage: "gearshape") { actions.openSettings(projectID) }
        }
    }

    @ViewBuilder
    private func markReadButton(_ chatID: String?) -> some View {
        if let chatID {
            Button("Mark Read", systemImage: "envelope.open") { actions.markRead(chatID) }
                .tint(HausPlatformColor.accent)
        }
    }

    private var emptyProjects: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(filter.isNarrowed ? "No projects match" : "No projects yet")
                .font(.body.weight(.medium))
                .foregroundStyle(HausPlatformColor.ink)
            Text(filter.isNarrowed ? "Clear the filter to see every project." : "A project is where people and Captains work together.")
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 16)
    }
}
