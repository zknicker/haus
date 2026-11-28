import HausModels

/// What each tab's rail lists, from the rows its full list already draws.
public enum ListRails {
    /// Home's recent conversations, in Recent's order.
    public static func home(
        _ rows: [HomeRowPresentation],
        workingCaptainIDs: Set<String>,
        selected: HomeRowTarget?
    ) -> [ListRailItem<HomeRowTarget>] {
        rows.map { row in
            ListRailItem(
                target: row.target,
                label: row.title,
                mark: mark(row.lead),
                badge: ListRailItem<HomeRowTarget>.badge(isUnread: row.isUnread, isWorking: isWorking(row.lead, workingCaptainIDs)),
                isSelected: row.target == selected
            )
        }
    }

    /// The Projects, in the list's order with `#all` last.
    public static func projects(_ rows: [ProjectRowPresentation], selectedChatID: String?) -> [ListRailItem<String>] {
        ProjectsFilter().apply(rows).map { row in
            ListRailItem(
                target: row.chatID,
                label: row.name,
                mark: .project(row.appearance),
                badge: row.isUnread ? .unread : nil,
                isSelected: row.chatID == selectedChatID
            )
        }
    }

    /// The Tasks of the list's view, in its activity order, each as its disc.
    public static func tasks(_ content: TaskListContent, view: TaskListView, selectedTaskID: String?) -> [ListRailItem<String>] {
        let sections = TaskListSections.sections(content.tasks ?? [], view: view, viewerUserID: content.viewerUserID)
        return sections.flatMap { section in
            section.tasks.map { task in
                ListRailItem(
                    target: task.id,
                    label: task.title,
                    mark: .task(section.disc),
                    badge: content.unreadTaskIDs.contains(task.id) ? .unread : nil,
                    isSelected: task.id == selectedTaskID
                )
            }
        }
    }

    /// You's settings rows that select a screen, as the hub lists them.
    /// Appearance and the app icon change in place, so they stay in the list.
    public static func you(_ data: SettingsData, selected: SettingsRoute?) -> [ListRailItem<SettingsRoute>] {
        let profile = ListRailItem(
            target: SettingsRoute.profile,
            label: data.viewer.displayName,
            mark: .person(name: data.viewer.displayName, avatarURL: data.viewer.avatarURL),
            isSelected: selected == .profile
        )
        return [profile] + settingsRows(canManageServer: data.canManageServer).map { route, label, icon in
            ListRailItem(target: route, label: label, mark: .icon(icon), isSelected: route == selected)
        }
    }

    private static func settingsRows(canManageServer: Bool) -> [(SettingsRoute, String, HausIconName)] {
        let automations: [(SettingsRoute, String, HausIconName)] = canManageServer
            ? [(.automations, "Automations", .reminder)]
            : []
        return automations + [
            (.drive(prefix: ""), "Drive", .folder),
            (.general, "General", .settings),
            (.notifications, "Notifications", .notification),
            (.captains, "Captains", .agents),
            (.models, "Models & connections", .skill),
            (.projects, "Projects", .channel),
            (.computers, "Devices", .computer),
            (.people, "People", .members),
            (.server, "Server", .server),
            (.appInfo, "About", .info),
        ]
    }

    private static func mark(_ lead: HomeRowLead) -> ListRailItem<HomeRowTarget>.Mark {
        switch lead {
        case .captain(let captain): .captain(captain)
        case .person(let name, let avatarURL): .person(name: name, avatarURL: avatarURL)
        case .project(let appearance): .project(appearance)
        case .task(let state): .task(state)
        }
    }

    private static func isWorking(_ lead: HomeRowLead, _ workingCaptainIDs: Set<String>) -> Bool {
        switch lead {
        case .captain(let captain): workingCaptainIDs.contains(captain.id)
        case .task(let state): state == .active(.working)
        case .person, .project: false
        }
    }
}
