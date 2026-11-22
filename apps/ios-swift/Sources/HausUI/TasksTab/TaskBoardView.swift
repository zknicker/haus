import HausModels
import SwiftUI

/// The Tasks tab: filter chips over Tasks grouped by state, under the stock
/// centered title with display options and New task in glass circles.
///
/// Blank while the list for the current filter loads; an empty state only once
/// it has loaded and nothing matches.
public struct TaskBoardView: View {
    private let content: TaskBoardContent
    @Binding private var filter: TaskBoardFilter
    private let onOpenTask: (String) -> Void
    private let onCreateTask: (NewTaskDraft) async throws -> Void

    @AppStorage("haus.tasks.ordering") private var ordering = TaskBoardOrdering.newest
    @State private var isCreating = false

    public init(
        content: TaskBoardContent,
        filter: Binding<TaskBoardFilter>,
        onOpenTask: @escaping (String) -> Void,
        onCreateTask: @escaping (NewTaskDraft) async throws -> Void
    ) {
        self.content = content
        _filter = filter
        self.onOpenTask = onOpenTask
        self.onCreateTask = onCreateTask
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TaskBoardFilterChips(filter: $filter, content: content)
                        .padding(.top, 8)
                    list(now: context.date)
                }
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(HausPlatformColor.canvas)
        .navigationTitle("Tasks")
        .hausInlineNavigationTitle()
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                displayOptions
                Button("New task", systemImage: "plus") { isCreating = true }
                    .disabled(content.projects.isEmpty || content.captains.isEmpty)
            }
        }
        .sheet(isPresented: $isCreating) {
            NewTaskSheet(projects: content.projects, captains: content.captains, onCreate: onCreateTask)
        }
    }

    @ViewBuilder
    private func list(now: Date) -> some View {
        if let tasks = content.tasks {
            let sections = TaskBoardSections.sections(
                tasks,
                filter: filter,
                scope: content.scope,
                waitingOnYou: content.waitingOnYouTaskIDs,
                ordering: ordering
            )
            if sections.isEmpty {
                ContentUnavailableView(
                    TaskBoardEmptyState.title(for: filter),
                    systemImage: "checklist",
                    description: Text(TaskBoardEmptyState.message(for: filter))
                )
                .padding(.top, 80)
            } else {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(sections) { section in
                        WorkListSection(section.title, count: section.tasks.count) {
                            ForEach(section.tasks) { task in
                                row(task, in: section, now: now)
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private func row(_ task: TaskRecord, in section: TaskBoardSection, now: Date) -> some View {
        Button {
            onOpenTask(task.id)
        } label: {
            TaskBoardRow(
                task: task,
                assignee: content.person(task.assignee),
                projectName: content.project(id: task.projectID)?.name,
                isWaitingOnYou: section.kind == .waitingOnYou,
                now: now
            )
        }
        .buttonStyle(.pressableRow)
        .accessibilityIdentifier("tasks-row-\(task.key)")
    }

    private var displayOptions: some View {
        Menu("Display options", systemImage: "slider.horizontal.3") {
            Picker("Order by", selection: $ordering) {
                ForEach(TaskBoardOrdering.allCases, id: \.self) { Text($0.title).tag($0) }
            }
        }
    }
}

/// The empty state's words for the filter in force.
enum TaskBoardEmptyState {
    static func title(for filter: TaskBoardFilter) -> String {
        filter.state == .open && !filter.hasExtraFilters ? "No open tasks" : "No matching tasks"
    }

    static func message(for filter: TaskBoardFilter) -> String {
        switch filter.scope {
        case .mine: "Tasks you or your Captains start show up here."
        case .assignedToMe: "Tasks assigned to you show up here."
        case .everyone: "Try another filter."
        }
    }
}
