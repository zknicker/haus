import HausModels
import SwiftUI

/// What the Tasks tab draws from. `tasks` is nil until the list for the view
/// in force has loaded, so the tab stays blank rather than empty.
public struct TaskListContent: Sendable {
    public let tasks: [TaskRecord]?
    public let viewerUserID: String?
    /// Project names, by Project id.
    public let projectNames: [String: String]
    /// Machine names, by Computer id.
    public let machineNames: [String: String]
    /// Model labels, by model id.
    public let modelLabels: [String: String]
    public let unreadTaskIDs: Set<String>

    public init(
        tasks: [TaskRecord]?,
        viewerUserID: String?,
        projectNames: [String: String] = [:],
        machineNames: [String: String] = [:],
        modelLabels: [String: String] = [:],
        unreadTaskIDs: Set<String> = []
    ) {
        self.tasks = tasks
        self.viewerUserID = viewerUserID
        self.projectNames = projectNames
        self.machineNames = machineNames
        self.modelLabels = modelLabels
        self.unreadTaskIDs = unreadTaskIDs
    }

    /// The web App's row facts: the Project, then `Machine · model`, then the age.
    func metaPieces(_ task: TaskRecord, now: Date) -> [String] {
        let machine = task.computerID.flatMap { machineNames[$0] }
        let model = task.model.map { modelLabels[$0] ?? $0 }
        return [projectNames[task.projectID], machine, model, HausCompactRelativeTime.label(for: task.createdAt, now: now)]
            .compactMap { $0 }
    }
}

/// The Tasks tab: My tasks, All tasks, and Archived as filter chips over the
/// Tasks grouped by activity, under the stock centered title with New task.
///
/// Blank while the list for the current view loads; an empty state only once
/// it has loaded and nothing matches.
public struct TaskListScreen: View {
    private let content: TaskListContent
    @Binding private var view: TaskListView
    private let onOpenTask: (String) -> Void
    private let onNewTask: (() -> Void)?
    private let selectedTaskID: String?

    /// - Parameter selectedTaskID: the Task the content pane shows beside the list.
    public init(
        content: TaskListContent,
        view: Binding<TaskListView>,
        selectedTaskID: String? = nil,
        onOpenTask: @escaping (String) -> Void,
        onNewTask: (() -> Void)?
    ) {
        self.content = content
        _view = view
        self.selectedTaskID = selectedTaskID
        self.onOpenTask = onOpenTask
        self.onNewTask = onNewTask
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    chips.padding(.top, 8)
                    list(now: context.date)
                }
                .padding(.bottom, 24)
            }
            .reportsChromeScroll()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(HausPlatformColor.canvas)
        .hausScreenTitle("Tasks")
        .toolbar {
            if let onNewTask {
                ToolbarItem(placement: .primaryAction) {
                    Button("New task", systemImage: "plus", action: onNewTask)
                        .hausHeaderGlyph()
                }
            }
        }
    }

    private var chips: some View {
        FilterChipRow {
            ForEach(TaskListView.allCases, id: \.self) { option in
                FilterChip(option.title, isSelected: view == option) { view = option }
            }
        }
    }

    @ViewBuilder
    private func list(now: Date) -> some View {
        if let tasks = content.tasks {
            let sections = TaskListSections.sections(tasks, view: view, viewerUserID: content.viewerUserID)
            if sections.isEmpty {
                ContentUnavailableView(
                    TaskListSections.emptyTitle(view),
                    systemImage: "checklist",
                    description: TaskListSections.emptyMessage(view).map { Text($0) }
                )
                .padding(.top, 80)
            } else {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(sections) { section in
                        WorkListSection(section.title, count: section.tasks.count) {
                            ForEach(section.tasks) { row($0, disc: section.disc, now: now) }
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private func row(_ task: TaskRecord, disc: TaskDiscState, now: Date) -> some View {
        Button {
            onOpenTask(task.id)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                WorkListRow(title: task.title) {
                    TaskActivityDisc(state: disc, size: 16, surface: HausPlatformColor.canvas)
                } meta: {
                    WorkMetaLine(pieces: content.metaPieces(task, now: now))
                }
                if content.unreadTaskIDs.contains(task.id) {
                    ListUnreadDot().padding(.top, 14)
                }
            }
            .contentShape(.rect)
            .accessibilityElement(children: .combine)
            .accessibilityValue(disc.label)
        }
        .buttonStyle(.pressableRow)
        .listSelection(task.id == selectedTaskID)
        .accessibilityIdentifier("tasks-row-\(task.shortID)")
    }
}
