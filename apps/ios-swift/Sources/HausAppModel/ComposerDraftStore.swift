import Observation

/// Where a composer sends: a Chat by id, or a Task by its id before its Chat
/// is known.
public enum ComposerDestination: Hashable, Sendable {
    case chat(String)
    case task(String)
}

public struct ComposerDraftKey: Hashable, Sendable {
    public let serverID: String
    public let destination: ComposerDestination

    public init(serverID: String, destination: ComposerDestination) {
        self.serverID = serverID
        self.destination = destination
    }
}

/// A conversation's composer with a Task beside it, whose chip the reader
/// can let go of.
public struct ComposerTaskTarget: Hashable, Sendable {
    public let conversation: ComposerDraftKey
    public let taskID: String

    public init(conversation: ComposerDraftKey, taskID: String) {
        self.conversation = conversation
        self.taskID = taskID
    }
}

/// Half-typed drafts and staged attachments, owned above every screen so
/// leaving a Chat or Task keeps them, and keyed by Server so one
/// Server's draft never shows on another's. A conversation with a Task
/// beside it writes to the Task's draft until its chip is let go.
@MainActor
@Observable
public final class ComposerDraftStore<Staged: AnyObject> {
    public private(set) var texts: [ComposerDraftKey: String] = [:]
    public private(set) var releasedTargets: Set<ComposerTaskTarget> = []
    @ObservationIgnored private var staged: [ComposerDraftKey: Staged] = [:]
    @ObservationIgnored private let makeStaged: @MainActor () -> Staged
    @ObservationIgnored private let discardStaged: @MainActor (Staged) -> Void

    /// - Parameters:
    ///   - makeStaged: creates the staged-attachment holder for a key the
    ///     first time its composer draws.
    ///   - discardStaged: deletes a dropped holder's staged files.
    public init(makeStaged: @escaping @MainActor () -> Staged, discardStaged: @escaping @MainActor (Staged) -> Void) {
        self.makeStaged = makeStaged
        self.discardStaged = discardStaged
    }

    public func text(for key: ComposerDraftKey) -> String {
        texts[key] ?? ""
    }

    public func setText(_ text: String, for key: ComposerDraftKey) {
        let stored = text.isEmpty ? nil : text
        guard texts[key] != stored else { return }
        texts[key] = stored
    }

    public func staged(for key: ComposerDraftKey) -> Staged {
        if let existing = staged[key] { return existing }
        let created = makeStaged()
        staged[key] = created
        return created
    }

    public func hasStaged(for key: ComposerDraftKey) -> Bool {
        staged[key] != nil
    }

    /// Where a conversation's composer sends: the Task beside it, until the
    /// reader lets go of the Task's chip, else the conversation itself.
    public func target(_ conversation: ComposerDraftKey, beside taskID: String?) -> ComposerDestination {
        guard let taskID, !releasedTargets.contains(ComposerTaskTarget(conversation: conversation, taskID: taskID)) else {
            return conversation.destination
        }
        return .task(taskID)
    }

    /// The chip's ×: the composer writes to the conversation again.
    public func release(_ conversation: ComposerDraftKey, from taskID: String) {
        releasedTargets.insert(ComposerTaskTarget(conversation: conversation, taskID: taskID))
    }

    /// Opening the Task from its card again brings its chip back.
    public func aim(at taskID: String, serverID: String) {
        let kept = releasedTargets.filter { $0.taskID != taskID || $0.conversation.serverID != serverID }
        if kept != releasedTargets { releasedTargets = kept }
    }

    /// Drops one destination's draft and staged files.
    public func clear(_ key: ComposerDraftKey) {
        texts[key] = nil
        if let holder = staged.removeValue(forKey: key) { discardStaged(holder) }
    }

    /// Membership loss: nothing typed for that Server survives it.
    public func clear(serverID: String) {
        let keys = Set(texts.keys).union(staged.keys).filter { $0.serverID == serverID }
        keys.forEach(clear)
        releasedTargets = releasedTargets.filter { $0.conversation.serverID != serverID }
    }

    /// Sign-out: every Server's drafts and staged files go.
    public func clearAll() {
        let keys = Set(texts.keys).union(staged.keys)
        keys.forEach(clear)
        releasedTargets = []
    }
}
