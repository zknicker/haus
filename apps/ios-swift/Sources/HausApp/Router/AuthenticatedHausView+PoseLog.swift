import Foundation
import HausAppModel
import os

/// A rebuilt stack refusing its own write (`HausRouter.setStackPath`) is the
/// one fold event still unexplained, so it is logged under `chat.haus.ios` /
/// `pose` with the call stack that made it, one frame per line.
extension AuthenticatedHausView {
    func logRefusedStackWrite(_ path: [HausRoute], over current: [HausRoute], tab: HausTab) {
        let logger = Logger(subsystem: "chat.haus.ios", category: "pose")
        logger.notice("\(String(describing: tab), privacy: .public) stack wrote \(path.count) over \(current.count) routes before its top appeared; kept")
        Thread.callStackSymbols.prefix(80).forEach { logger.notice("frame \($0, privacy: .public)") }
    }
}
