import Testing
@testable import HausModels

@Suite("Held sidebar order")
struct HeldOrderTests {
    @Test("Unheld, the live order passes through")
    func unheldPassesThrough() {
        let order = HeldOrder<String>()
        #expect(order.apply(["c", "a", "b"], id: { $0 }) == ["c", "a", "b"])
    }

    @Test("Held, a Chat that jumps to the top stays where the reader saw it")
    func heldKeepsCapturedOrder() {
        var order = HeldOrder<String>()
        order.hold(["a", "b", "c"])
        #expect(order.apply(["c", "a", "b"], id: { $0 }) == ["a", "b", "c"])
    }

    @Test("Held, a new Chat takes its live position and a removed one disappears")
    func heldInsertsNewRows() {
        var order = HeldOrder<String>()
        order.hold(["a", "b", "c"])
        #expect(order.apply(["new", "c", "a"], id: { $0 }) == ["new", "a", "c"])
    }

    @Test("Re-holding or releasing adopts the live order")
    func reholdAdoptsLiveOrder() {
        var order = HeldOrder<String>()
        order.hold(["a", "b", "c"])
        order.hold(["c", "a", "b"])
        #expect(order.apply(["c", "a", "b"], id: { $0 }) == ["c", "a", "b"])
        order.release()
        #expect(!order.isHeld)
        #expect(order.apply(["b", "c", "a"], id: { $0 }) == ["b", "c", "a"])
    }
}
