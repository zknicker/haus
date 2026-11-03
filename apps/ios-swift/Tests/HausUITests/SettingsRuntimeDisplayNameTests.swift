@testable import HausUI
import Testing

struct SettingsRuntimeDisplayNameTests {
    @Test func mapsKnownRuntimeSlugsToProductNames() {
        #expect(settingsRuntimeDisplayName("codex") == "Codex")
        #expect(settingsRuntimeDisplayName("claude-code") == "Claude Code")
        #expect(settingsRuntimeDisplayName("claude_code") == "Claude Code")
        #expect(settingsRuntimeDisplayName("grok-build") == "Grok Build")
    }

    @Test func passesThroughUnknownSlugsUnchanged() {
        #expect(settingsRuntimeDisplayName("some-future-runtime") == "some-future-runtime")
    }
}
