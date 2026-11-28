import SwiftUI
import Testing
@testable import HausUI

@Suite("Which bars the shell draws")
struct ShellChromeTests {
    @Test("A regular iPhone, compact with horizontal bars, keeps Haus's own chrome")
    func compactHorizontal() {
        #expect(ShellChrome(barsAreVertical: false, isRegularWidth: false) == .custom)
    }

    @Test("The Duo's outer display, compact with vertical bars, uses the system's bars")
    func compactVertical() {
        #expect(ShellChrome(barsAreVertical: true, isRegularWidth: false) == .stock)
    }

    @Test("The Duo's inner display in portrait, regular with horizontal bars, uses the system's bars")
    func regularHorizontal() {
        #expect(ShellChrome(barsAreVertical: false, isRegularWidth: true) == .stock)
    }

    @Test("The Duo's inner display in landscape, regular with vertical bars, uses the system's bars")
    func regularVertical() {
        #expect(ShellChrome(barsAreVertical: true, isRegularWidth: true) == .stock)
    }

    @Test("With stock bars a transcript stops at the rail and still runs under the header and composer")
    func transcriptEdges() {
        #expect(ShellChrome.stock.transcriptIgnoredEdges == .vertical)
        #expect(!ShellChrome.stock.transcriptIgnoredEdges.contains(.leading))
        #expect(!ShellChrome.stock.transcriptIgnoredEdges.contains(.trailing))
        #expect(ShellChrome.custom.transcriptIgnoredEdges == .all)
    }

    @Test("Custom chrome hides the system tab bar on every screen")
    func customTabBar() {
        #expect(ShellChrome.custom.tabBar(showsTabBar: true) == .hidden)
        #expect(ShellChrome.custom.tabBar(showsTabBar: false) == .hidden)
    }

    @Test("Stock chrome follows the router: a stacked push hides the bar and a root or split selection keeps it")
    func stockTabBar() {
        #expect(ShellChrome.stock.tabBar(showsTabBar: false) == .hidden)
        #expect(ShellChrome.stock.tabBar(showsTabBar: true) == .visible)
    }
}
