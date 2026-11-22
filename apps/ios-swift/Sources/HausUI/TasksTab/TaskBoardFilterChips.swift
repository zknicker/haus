import HausModels
import SwiftUI

/// "Open ⌄", "Mine ⌄", each "+ Filter" choice in force, and "+ Filter".
struct TaskBoardFilterChips: View {
    @Binding var filter: TaskBoardFilter
    let content: TaskBoardContent

    var body: some View {
        FilterChipRow {
            FilterChipMenu(filter.state.title, isSelected: true) {
                Picker("State", selection: $filter.state) {
                    ForEach(TaskBoardStateChoice.allCases, id: \.self) { Text($0.title).tag($0) }
                }
            }
            FilterChipMenu(filter.scope.title) {
                Picker("Whose", selection: scope) {
                    ForEach(TaskBoardScope.allCases, id: \.self) { Text($0.title).tag($0) }
                }
            }
            if let project = filter.project {
                FilterChip(project.name, isSelected: true) { filter.project = nil }
                    .accessibilityHint("Removes the Project filter")
            }
            if let assignee = filter.assignee {
                FilterChip(assigneeTitle(assignee), isSelected: true) { filter.assignee = nil }
                    .accessibilityHint("Removes the assignee filter")
            }
            if let label = content.labels.first(where: { $0.id == filter.labelID }) {
                FilterChip(label.name, isSelected: true) { filter.labelID = nil }
                    .accessibilityHint("Removes the label filter")
            }
            FilterChipMenu("Filter", accessory: .add) {
                addMenu
            }
        }
    }

    @ViewBuilder
    private var addMenu: some View {
        if !content.projects.isEmpty {
            Menu("Project") {
                ForEach(content.projects) { project in
                    Button(project.name) { filter.project = project }
                }
            }
        }
        Menu("Assignee") {
            Button("Unassigned") { setAssignee(.unassigned) }
            Section("Captains") {
                ForEach(content.captains) { person in
                    Button(person.name) { setAssignee(.actor(person.actor)) }
                }
            }
            Section("People") {
                ForEach(content.people) { person in
                    Button(person.name) { setAssignee(.actor(person.actor)) }
                }
            }
        }
        if !content.labels.isEmpty {
            Menu("Label") {
                ForEach(content.labels) { label in
                    Button(label.name) { filter.labelID = label.id }
                }
            }
        }
    }

    private var scope: Binding<TaskBoardScope> {
        Binding(get: { filter.scope }, set: { filter.choose(scope: $0) })
    }

    private func setAssignee(_ choice: TaskBoardAssigneeChoice) {
        filter.choose(assignee: choice)
    }

    private func assigneeTitle(_ choice: TaskBoardAssigneeChoice) -> String {
        switch choice {
        case .unassigned: "Unassigned"
        case .actor(let actor): content.person(actor)?.name ?? "Assignee"
        }
    }
}
