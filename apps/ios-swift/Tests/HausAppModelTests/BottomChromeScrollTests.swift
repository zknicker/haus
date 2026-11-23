import Testing
@testable import HausAppModel

@Suite("Bottom chrome fold")
struct BottomChromeScrollTests {
    @Test("Scrolling down folds the chrome only after a full travel")
    func foldsAfterTravel() {
        var chrome = BottomChromeScroll()
        chrome.scroll(from: 0, to: 10)
        #expect(!chrome.isCollapsed)
        chrome.scroll(from: 10, to: 23)
        #expect(!chrome.isCollapsed)
        chrome.scroll(from: 23, to: 40)
        #expect(chrome.isCollapsed)
    }

    @Test("Scrolling back up unfolds it, and small wobbles do not")
    func unfoldsOnScrollUp() {
        var chrome = BottomChromeScroll()
        chrome.scroll(from: 0, to: 200)
        #expect(chrome.isCollapsed)
        chrome.scroll(from: 200, to: 190)
        chrome.scroll(from: 190, to: 205)
        #expect(chrome.isCollapsed)
        chrome.scroll(from: 205, to: 180)
        #expect(!chrome.isCollapsed)
        chrome.scroll(from: 180, to: 190)
        #expect(!chrome.isCollapsed)
    }

    @Test("Reaching the top unfolds it at once")
    func topUnfolds() {
        var chrome = BottomChromeScroll()
        chrome.scroll(from: 0, to: 100)
        chrome.scroll(from: 100, to: 0)
        #expect(!chrome.isCollapsed)
    }

    @Test("Expanding resets the run, so the next fold needs a full travel again")
    func expandResets() {
        var chrome = BottomChromeScroll()
        chrome.scroll(from: 0, to: 300)
        chrome.expand()
        #expect(!chrome.isCollapsed)
        chrome.scroll(from: 300, to: 310)
        #expect(!chrome.isCollapsed)
        chrome.scroll(from: 310, to: 330)
        #expect(chrome.isCollapsed)
    }

    @Test("Distance clamps rubber banding at either end, and a short list never scrolls")
    func distanceClamps() {
        let distance = { (offset: Double, content: Double) in
            BottomChromeScroll.distance(offset: offset, topInset: 100, bottomInset: 50, content: content, container: 800)
        }
        #expect(distance(-100, 2000) == 0)
        #expect(distance(-160, 2000) == 0)
        #expect(distance(400, 2000) == 500)
        #expect(distance(1300, 2000) == 1350)
        #expect(distance(1260, 2000) == 1350)
        #expect(distance(40, 300) == 0)
    }
}
