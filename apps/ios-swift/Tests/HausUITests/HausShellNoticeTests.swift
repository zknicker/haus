import Foundation
@testable import HausUI
import Testing

/// The shell banner speaks product copy only, and each failure is its own
/// event so a repeat is announced again.
struct HausShellNoticeTests {
    @Test("Every reason reads as calm product copy, never transport jargon")
    func copyIsProductLanguage() {
        for reason in HausShellNotice.Reason.allCases {
            let message = HausShellNotice(reason).message
            #expect(message.hasSuffix("Check your connection and try again."))
            for jargon in ["tRPC", "HTTP", "error", "-32", "<"] {
                #expect(!message.contains(jargon), "\(reason) leaks \(jargon)")
            }
        }
    }

    @Test("A repeat of the same failure is a new notice")
    func repeatIsNews() {
        let first = HausShellNotice(.messageNotSent)
        let second = HausShellNotice(.messageNotSent)
        #expect(first.message == second.message)
        #expect(first != second)
        #expect(first.id != second.id)
    }
}
