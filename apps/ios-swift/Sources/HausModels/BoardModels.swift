import Foundation

/// The fixed category every board column maps to (ADR 0051). Code reasons about
/// the category; the column name is presentation.
public enum ColumnCategory: String, Codable, CaseIterable, Hashable, Sendable {
    case backlog
    case todo
    case active
    case done
    case canceled

    /// A board always keeps at least one column in each of these.
    public static let required: [ColumnCategory] = [.todo, .active, .done]

    /// A Task in one of these is finished, and carries `completedAt`.
    public var isClosed: Bool { self == .done || self == .canceled }

    public var displayName: String {
        switch self {
        case .backlog: "Backlog"
        case .todo: "Todo"
        case .active: "Active"
        case .done: "Done"
        case .canceled: "Canceled"
        }
    }
}

public struct BoardColumn: Codable, Identifiable, Hashable, Sendable {
    public let category: ColumnCategory
    public let id: String
    public let name: String
    public let position: Int

    public init(category: ColumnCategory, id: String, name: String, position: Int) {
        self.category = category
        self.id = id
        self.name = name
        self.position = position
    }
}

public struct Board: Codable, Identifiable, Hashable, Sendable {
    /// Every Server's always-present board: it keeps its key and is never archived.
    public static let generalKey = "GEN"

    /// Archived boards leave default lists and refuse new Tasks.
    public let archivedAt: Date?
    /// In board order.
    public let columns: [BoardColumn]
    public let createdAt: Date
    public let id: String
    public let key: String
    public let name: String
    /// Tasks in a `backlog`, `todo`, or `active` column.
    public let openTaskCount: Int
    public let serverID: String
    public let updatedAt: Date
    public let version: Int

    public init(
        archivedAt: Date?,
        columns: [BoardColumn],
        createdAt: Date,
        id: String,
        key: String,
        name: String,
        openTaskCount: Int,
        serverID: String,
        updatedAt: Date,
        version: Int
    ) {
        self.archivedAt = archivedAt
        self.columns = columns
        self.createdAt = createdAt
        self.id = id
        self.key = key
        self.name = name
        self.openTaskCount = openTaskCount
        self.serverID = serverID
        self.updatedAt = updatedAt
        self.version = version
    }

    enum CodingKeys: String, CodingKey {
        case archivedAt
        case columns
        case createdAt
        case id
        case key
        case name
        case openTaskCount
        case serverID = "serverId"
        case updatedAt
        case version
    }

    public var isGeneral: Bool { key == Self.generalKey }
    public var isArchived: Bool { archivedAt != nil }

    /// The column a one-tap resolution lands in: Start, Done, and Won't do move
    /// a Task to the board's first column of that category.
    public func firstColumn(in category: ColumnCategory) -> BoardColumn? {
        columns.first { $0.category == category }
    }

    public func column(id: String) -> BoardColumn? {
        columns.first { $0.id == id }
    }

    /// `SEC`: 2–5 uppercase letters or digits, starting with a letter.
    public static func isValidKey(_ key: String) -> Bool {
        key.wholeMatch(of: /[A-Z][A-Z0-9]{1,4}/) != nil
    }

    /// A key offered for a new board: the initials of a name of several words,
    /// else the name's first letters, cut to what a key may hold. It is a
    /// suggestion the person edits, so it only has to be a valid one.
    public static func suggestedKey(forName name: String) -> String {
        let words = name
            .uppercased()
            .split { !$0.isASCII || !($0.isLetter || $0.isNumber) }
        let initials = words.count > 1 ? words.compactMap(\.first).map(String.init).joined() : ""
        let source = initials.count >= 2 ? initials : words.joined()
        return String(source.drop(while: { !$0.isLetter }).prefix(5))
    }
}

/// `board.list`. Archived boards come back with the rest, so one read serves
/// the picker's two sections.
public struct BoardListInput: Encodable, Equatable, Sendable {
    public let includeArchived: Bool
    public let serverID: String

    public init(serverID: String, includeArchived: Bool) {
        self.includeArchived = includeArchived
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case includeArchived
        case serverID = "serverId"
    }
}

public struct BoardCreateInput: Encodable, Equatable, Sendable {
    public let key: String
    public let name: String
    public let serverID: String

    public init(serverID: String, key: String, name: String) {
        self.key = key
        self.name = name
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case key
        case name
        case serverID = "serverId"
    }
}

/// At least one field must be set; the Server refuses an empty patch.
public struct BoardUpdatePatch: Encodable, Equatable, Sendable {
    /// Archive (true) or restore (false) the board.
    public let archived: Bool?
    /// Re-keying a board re-keys every Task on it; keys are derived when read.
    public let key: String?
    public let name: String?

    public init(name: String? = nil, key: String? = nil, archived: Bool? = nil) {
        self.archived = archived
        self.key = key
        self.name = name
    }

    public var isEmpty: Bool { archived == nil && key == nil && name == nil }
}

public struct BoardUpdateInput: Encodable, Equatable, Sendable {
    public let boardID: String
    public let expectedVersion: Int
    public let patch: BoardUpdatePatch
    public let serverID: String

    public init(serverID: String, boardID: String, expectedVersion: Int, patch: BoardUpdatePatch) {
        self.boardID = boardID
        self.expectedVersion = expectedVersion
        self.patch = patch
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case boardID = "boardId"
        case expectedVersion
        case patch
        case serverID = "serverId"
    }
}

/// One column in a `board.setColumns` list. A missing `id` creates the column.
public struct BoardColumnDraft: Encodable, Identifiable, Hashable, Sendable {
    /// The Server's id, nil for a column this editor just added.
    public let columnID: String?
    /// Stable within one edit, so a list row keeps its identity while it moves.
    public let id: String
    public var category: ColumnCategory
    public var name: String

    public init(column: BoardColumn) {
        columnID = column.id
        id = column.id
        category = column.category
        name = column.name
    }

    public init(id: String = UUID().uuidString, name: String = "", category: ColumnCategory = .todo) {
        columnID = nil
        self.id = id
        self.category = category
        self.name = name
    }

    enum CodingKeys: String, CodingKey {
        case category
        case columnID = "id"
        case name
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(category, forKey: .category)
        try container.encodeIfPresent(columnID, forKey: .columnID)
        try container.encode(name.trimmingCharacters(in: .whitespacesAndNewlines), forKey: .name)
    }
}

/// `board.setColumns`: replace the whole ordered list in one transaction.
public struct BoardSetColumnsInput: Encodable, Equatable, Sendable {
    public let boardID: String
    public let columns: [BoardColumnDraft]
    public let expectedVersion: Int
    /// Each removed column that holds Tasks, and the kept column they move to.
    public let moveTasks: [String: String]?
    public let serverID: String

    public init(
        serverID: String,
        boardID: String,
        expectedVersion: Int,
        columns: [BoardColumnDraft],
        moveTasks: [String: String]?
    ) {
        self.boardID = boardID
        self.columns = columns
        self.expectedVersion = expectedVersion
        self.moveTasks = moveTasks
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case boardID = "boardId"
        case columns
        case expectedVersion
        case moveTasks
        case serverID = "serverId"
    }
}

public struct BoardMutationResult: Decodable, Equatable, Sendable {
    public let board: Board
}
