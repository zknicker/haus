import Observation
import Synchronization
import Testing
@testable import HausAppModel

@MainActor
@Suite("Router chrome fold")
struct HausRouterChromeFoldTests {
    @Test("Scroll frames that do not fold the chrome notify no observer")
    func quietWhileScrolling() {
        let router = HausRouter()
        let notified = Mutex(false)
        withObservationTracking {
            _ = router.isChromeCollapsed
        } onChange: {
            notified.withLock { $0 = true }
        }
        for offset in stride(from: 0.0, to: 20, by: 1) {
            router.scrollRoot(.home, from: offset, to: offset + 1)
        }
        #expect(!notified.withLock { $0 })
        #expect(!router.isChromeCollapsed)
    }

    @Test("Folding and unfolding each notify once")
    func notifiesOnFold() {
        let router = HausRouter()
        let notifications = Mutex(0)
        func track() {
            withObservationTracking {
                _ = router.isChromeCollapsed
            } onChange: {
                notifications.withLock { $0 += 1 }
            }
        }
        track()
        for offset in stride(from: 0.0, to: 100, by: 2) {
            router.scrollRoot(.home, from: offset, to: offset + 2)
        }
        #expect(router.isChromeCollapsed)
        #expect(notifications.withLock { $0 } == 1)
        track()
        router.unfoldChrome()
        #expect(!router.isChromeCollapsed)
        #expect(notifications.withLock { $0 } == 2)
    }

    @Test("Another tab's scrolling leaves the chrome alone")
    func ignoresOtherTabs() {
        let router = HausRouter()
        router.scrollRoot(.tasks, from: 0, to: 200)
        #expect(!router.isChromeCollapsed)
    }
}
