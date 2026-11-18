import Foundation
import HausModels
import Observation
import OSLog

/// The Tasks this client holds: each opened Task's own read, the label
/// catalog, and the followed Tasks waiting in the Inbox.
///
/// Every list stays absent until its first read, so "nothing here" is never
/// confused with "not yet known", and a durable event refreshes only what is
/// held. It is its own observable so a Task's state repaints its screen
/// without touching anything that watches the Store's Chat state.
@MainActor
@Observable
final class TaskSnapshots {
    var detailsByID: [String: TaskDetail] = [:]
    var labels: [TaskLabel]?
    /// The followed Tasks with messages waiting (ADR 0053 decision 9), from
    /// `chat.unreadPreviews`; nil until first read (`HausStoreTaskPlaces.swift`).
    var unreadTasks: [ChatUnreadPreview]?
    /// The newest read started per Task, so an older answer writes nothing.
    @ObservationIgnored var readTokens: [String: Int] = [:]

    func reset() {
        detailsByID = [:]
        labels = nil
        unreadTasks = nil
        readTokens = [:]
    }
}
