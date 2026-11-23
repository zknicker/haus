/// What a fresh Server still needs before work can start, and the next steps
/// each role gets. Mirrors the web App's `firstRunCopy`.
public struct FirstRunCopy: Equatable, Sendable {
    public enum Action: Equatable, Sendable {
        case connectDevice
        case newProject
        case newCaptain
    }

    public let title: String
    public let description: String
    public let actions: [Action]

    /// Nil once the Server has a Project and a Captain.
    public static func needed(
        projectCount: Int,
        captainCount: Int,
        deviceCount: Int?,
        canManage: Bool
    ) -> FirstRunCopy? {
        let needsProject = projectCount == 0
        let needsCaptain = captainCount == 0
        guard needsProject || needsCaptain else { return nil }
        let needsDevice = needsCaptain && (deviceCount ?? 0) == 0
        var actions: [Action] = []
        if needsDevice, canManage { actions.append(.connectDevice) }
        if needsProject { actions.append(.newProject) }
        if needsCaptain, !needsDevice, canManage { actions.append(.newCaptain) }
        let lines = [
            needsProject ? "Create a project for the work." : nil,
            needsCaptain ? captainLine(canManage: canManage, needsDevice: needsDevice) : nil,
        ]
        return FirstRunCopy(
            title: title(needsProject: needsProject, needsCaptain: needsCaptain, needsDevice: needsDevice, canManage: canManage),
            description: lines.compactMap(\.self).joined(separator: " "),
            actions: actions
        )
    }

    private static func captainLine(canManage: Bool, needsDevice: Bool) -> String {
        switch (canManage, needsDevice) {
        case (false, true): "An Owner or Admin connects a Device and adds Captains."
        case (false, false): "An Owner or Admin adds Captains."
        case (true, true): "A Captain needs a Device first, so connect one before adding a Captain."
        case (true, false): "Add a Captain to take on the work you ask for here."
        }
    }

    private static func title(needsProject: Bool, needsCaptain: Bool, needsDevice: Bool, canManage: Bool) -> String {
        if needsProject, needsCaptain { return "Set up your Haus" }
        if needsProject { return "Create your first project" }
        if !canManage { return "No Captains yet" }
        return needsDevice ? "Connect a Device" : "Add your first Captain"
    }
}
