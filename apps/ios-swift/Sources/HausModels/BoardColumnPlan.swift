import Foundation

/// The column editor's draft, checked the way `board.setColumns` will check it
/// (`boards/column-plan.ts`), so Save is only offered for a list the Server
/// takes. The Server stays the authority; this is the phone's early answer.
public struct BoardColumnPlan: Equatable, Sendable {
    public static let nameMaxLength = 40

    public enum Problem: Equatable, Sendable {
        case blankName
        case nameTooLong
        case duplicateName(String)
        case missingCategory(ColumnCategory)
        /// A removed column still holds Tasks and has nowhere to send them.
        case needsTarget(columnID: String)
    }

    public let original: [BoardColumn]
    public let drafts: [BoardColumnDraft]
    /// Tasks per existing column id.
    public let taskCounts: [String: Int]
    /// The kept column each removed column's Tasks move to, by the removed id.
    public let targets: [String: String]

    public init(
        original: [BoardColumn],
        drafts: [BoardColumnDraft],
        taskCounts: [String: Int],
        targets: [String: String]
    ) {
        self.original = original
        self.drafts = drafts
        self.taskCounts = taskCounts
        self.targets = targets
    }

    /// Existing columns the draft left out, in board order.
    public var removed: [BoardColumn] {
        let kept = Set(drafts.compactMap(\.columnID))
        return original.filter { !kept.contains($0.id) }
    }

    /// Removed columns that hold Tasks: the ones that need a target.
    public var removedWithTasks: [BoardColumn] {
        removed.filter { taskCounts[$0.id, default: 0] > 0 }
    }

    /// The columns a removed column's Tasks may go to: existing ones that stay.
    /// A column added in this edit has no id yet, so it cannot be named.
    public var targetChoices: [BoardColumnDraft] {
        drafts.filter { $0.columnID != nil }
    }

    /// Whether this draft can leave the list. The last column of a required
    /// category cannot: the invariant is locked, not an error after the fact.
    public func canRemove(_ draft: BoardColumnDraft) -> Bool {
        !isLastOfRequiredCategory(draft)
    }

    /// Whether this draft's category can change, on the same rule.
    public func canChangeCategory(_ draft: BoardColumnDraft) -> Bool {
        !isLastOfRequiredCategory(draft)
    }

    /// The `moveTasks` map to send, nil when nothing moves.
    public var moveTasks: [String: String]? {
        let moves = removedWithTasks.reduce(into: [String: String]()) { moves, column in
            moves[column.id] = targets[column.id]
        }
        return moves.isEmpty ? nil : moves
    }

    public var problems: [Problem] {
        var problems: [Problem] = []
        var names = Set<String>()
        for draft in drafts {
            let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty {
                problems.append(.blankName)
            } else if name.count > Self.nameMaxLength {
                problems.append(.nameTooLong)
            }
            if !name.isEmpty, !names.insert(name.lowercased()).inserted {
                problems.append(.duplicateName(name))
            }
        }
        let categories = Set(drafts.map(\.category))
        for category in ColumnCategory.required where !categories.contains(category) {
            problems.append(.missingCategory(category))
        }
        let keptIDs = Set(targetChoices.compactMap(\.columnID))
        for column in removedWithTasks {
            guard let target = targets[column.id], keptIDs.contains(target) else {
                problems.append(.needsTarget(columnID: column.id))
                continue
            }
        }
        return problems
    }

    public var isValid: Bool { problems.isEmpty }

    private func isLastOfRequiredCategory(_ draft: BoardColumnDraft) -> Bool {
        guard ColumnCategory.required.contains(draft.category) else { return false }
        return drafts.filter { $0.category == draft.category }.count == 1
    }
}
