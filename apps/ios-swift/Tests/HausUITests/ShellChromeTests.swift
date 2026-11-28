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
}
