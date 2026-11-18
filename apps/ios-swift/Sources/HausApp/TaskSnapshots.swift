import Foundation
import HausModels
import Observation
import OSLog

///
/// Every list stays absent until its first read, so "nothing here" is never
/// confused with "not yet known", and a durable event refreshes only what is
@MainActor
@Observable
final class TaskSnapshots {
    var detailsByID: [String: TaskDetail] = [:]
    var labels: [TaskLabel]?
    var unreadTasks: [ChatUnreadPreview]?
    @ObservationIgnored var readTokens: [String: Int] = [:]

    func reset() {
        detailsByID = [:]
        labels = nil
        unreadTasks = nil
        readTokens = [:]
    }
}
