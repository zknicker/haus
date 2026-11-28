import Foundation
import HausAppModel
import os
import SwiftUI

/// Evidence for state lost across a fold: each layout change, each screen a
/// tab's stack shows, and any stack write that drops several routes at once,
/// with who made it and what drafts the Store held then. Logged under
/// `chat.haus.ios` / `pose`.
extension AuthenticatedHausView {
    static let poseLogger = Logger(subsystem: "chat.haus.ios", category: "pose")

    func logLayoutChange(to layout: TabLayout) {
        Self.poseLogger.notice(
            "Layout \(String(describing: router.layout), privacy: .public) to \(String(describing: layout), privacy: .public), paths \(pathSummary, privacy: .public), drafts \(store.draftSummary, privacy: .public)"
        )
    }

    func logStackWrite(_ path: [HausRoute], over current: [HausRoute], tab: HausTab) {
        guard current.count - path.count > 1 else { return }
        Self.poseLogger.notice(
            "\(String(describing: tab), privacy: .public) stack wrote \(path.count) over \(current.count) routes, layout \(String(describing: router.layout), privacy: .public), drafts \(store.draftSummary, privacy: .public)\n\(Thread.callStackSymbols.prefix(48).joined(separator: "\n"), privacy: .public)"
        )
    }

    func logAppear(_ route: HausRoute, tab: HausTab) {
        Self.poseLogger.notice(
            "\(String(describing: tab), privacy: .public) shows \(String(describing: route), privacy: .public), layout \(String(describing: router.layout), privacy: .public)"
        )
    }

    private var pathSummary: String {
        HausTab.allCases.compactMap { tab in
            let path = router.path(tab)
            return path.isEmpty ? nil : "\(tab): \(path.map { String(describing: $0) }.joined(separator: " > "))"
        }
        .joined(separator: "; ")
    }
}
