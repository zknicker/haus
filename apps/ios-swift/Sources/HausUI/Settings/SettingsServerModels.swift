import Foundation
import HausModels

/// A Device's "Workers can run here" switch, as `computer.list` reports it.
public struct SettingsComputerWorkers: Hashable, Sendable {
    public let isEnabled: Bool
    public let canChange: Bool

    public init(isEnabled: Bool, canChange: Bool) {
        self.isEnabled = isEnabled
        self.canChange = canChange
    }
}

/// A Project's setup as You shows it: its key, repositories, and default Worker place.
public struct SettingsProject: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let key: String
    public let repositories: [String]
    public let defaultWorkerPlace: String?

    public init(id: String, name: String, key: String, repositories: [String] = [], defaultWorkerPlace: String? = nil) {
        self.id = id
        self.name = name
        self.key = key
        self.repositories = repositories
        self.defaultWorkerPlace = defaultWorkerPlace
    }
}

/// One model connection Captains pick models from, with its readiness and usage.
public struct SettingsModelConnection: Identifiable, Equatable, Sendable {
    public let id: String
    public let provider: ModelProvider
    public let label: String
    public let isEnabled: Bool
    public let isReady: Bool
    public let statusDetail: String?
    public let capacity: [ModelCapacityWindow]

    public init(
        id: String,
        provider: ModelProvider,
        label: String,
        isEnabled: Bool = true,
        isReady: Bool = true,
        statusDetail: String? = nil,
        capacity: [ModelCapacityWindow] = []
    ) {
        self.id = id
        self.provider = provider
        self.label = label
        self.isEnabled = isEnabled
        self.isReady = isReady
        self.statusDetail = statusDetail
        self.capacity = capacity
    }

    public init(_ connection: ModelConnection) {
        self.init(
            id: connection.id,
            provider: connection.provider,
            label: connection.label,
            isEnabled: connection.enabled,
            isReady: connection.status == .ready,
            statusDetail: connection.statusDetail,
            capacity: (connection.capacity ?? []).map(ModelCapacityWindow.init)
        )
    }

    /// "Claude · Zach's Max".
    public var title: String { "\(provider.displayName) · \(label)" }

    public var statusLabel: String {
        guard isEnabled else { return "Off" }
        return isReady ? "Ready" : "Needs attention"
    }

    /// The row's second line: what is wrong, else how much of the tightest window is left.
    public var detailLine: String? {
        if isEnabled, !isReady { return statusDetail }
        return ModelCapacityWindow.tightest(capacity).map { "\($0.percentLeft)% left" }
    }

    var usageGroup: ModelSheetGroup {
        ModelSheetGroup(id: id, provider: provider, label: label, capacity: capacity, options: [])
    }
}

/// The Server-wide reads and writes You shows beyond `SettingsData`. The App
/// owns the transport and the active Server; every closure acts on it.
public struct SettingsServerContent {
    /// `project.list`; nil until it has loaded.
    public let projects: [SettingsProject]?
    /// `modelConnections.list`; nil until it has loaded or when it is denied.
    public let modelConnections: [SettingsModelConnection]?
    public let reloadProjects: @Sendable () async throws -> Void
    /// `artifact.list` for one Drive folder, by its path prefix.
    public let loadDrive: @Sendable (String) async throws -> DriveListing
    public let openDriveFile: @MainActor (DriveFilePresentation) -> Void
    /// `computer.setWorkers`, by Computer id.
    public let setWorkers: @Sendable (String, Bool) async throws -> Void

    public init(
        projects: [SettingsProject]?,
        modelConnections: [SettingsModelConnection]?,
        reloadProjects: @escaping @Sendable () async throws -> Void,
        loadDrive: @escaping @Sendable (String) async throws -> DriveListing,
        openDriveFile: @escaping @MainActor (DriveFilePresentation) -> Void,
        setWorkers: @escaping @Sendable (String, Bool) async throws -> Void
    ) {
        self.projects = projects
        self.modelConnections = modelConnections
        self.reloadProjects = reloadProjects
        self.loadDrive = loadDrive
        self.openDriveFile = openDriveFile
        self.setWorkers = setWorkers
    }

    public static var preview: SettingsServerContent {
        SettingsServerContent(
            projects: SettingsFixtures.projects,
            modelConnections: SettingsFixtures.modelConnections,
            reloadProjects: {},
            loadDrive: { _ in DriveListing(folders: [], files: []) },
            openDriveFile: { _ in },
            setWorkers: { _, _ in }
        )
    }
}

extension SettingsFixtures {
    public static let projects = [
        SettingsProject(
            id: "project-haus",
            name: "haus",
            key: "HAUS",
            repositories: ["zknicker/haus"],
            defaultWorkerPlace: "Zach's MacBook Pro"
        ),
    ]

    public static let modelConnections = [
        SettingsModelConnection(
            id: "connection-claude",
            provider: .claude,
            label: "Zach's Max",
            capacity: [ModelCapacityWindow(id: "week", label: "Week", usedPercent: 36, resetsAt: nil)]
        ),
        SettingsModelConnection(
            id: "connection-chatgpt",
            provider: .chatgpt,
            label: "Pro",
            isReady: false,
            statusDetail: "Sign in again on a Device."
        ),
    ]
}
