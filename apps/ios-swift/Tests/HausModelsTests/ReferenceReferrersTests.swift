import HausModels
import Testing

@Suite("Reference referrers")
struct ReferenceReferrersTests {
    @Test("A page write reaches every Chat that links into it, once")
    func takesReferrersOnce() {
        var index = ReferenceReferrers()
        index.record(referrer: "dm", references: ["general"])
        index.record(referrer: "product", references: ["general", "design"])

        #expect(index.takeReferrers(of: ["general"]) == ["dm", "product"])
        #expect(index.takeReferrers(of: ["general"]).isEmpty)
        #expect(index.takeReferrers(of: ["design", "other"]) == ["product"])
    }

    @Test("A Chat linking its own Threads records nothing")
    func ignoresSelfReference() {
        var index = ReferenceReferrers()
        index.record(referrer: "general", references: ["general"])
        #expect(index.takeReferrers(of: ["general"]).isEmpty)
    }
}
