import Foundation
@testable import HausModels
@testable import HausUI
import Testing

/// Adapted from the App's `turn-trace-fold.test.ts` and `turn-trace-fold-label.test.ts`, plus the
/// duration and path readers they share.
struct TurnTraceFoldTests {
    private func lines(_ count: Int) -> String {
        (1...count).map { "line \($0)" }.joined(separator: "\n")
    }

    @Test func aBlockFoldsToEightLinesOnlyWhenItHoldsBackARealStretch() {
        #expect(TraceLineFold(lines(10)) == nil)
        #expect(TraceLineFold("\(lines(10))\n") == nil)

        let fold = TraceLineFold(lines(137))
        #expect(fold?.hiddenLines == 137 - TraceLineFold.shownLines)
        #expect(fold?.head == lines(TraceLineFold.shownLines))
    }

    @Test func theFoldControlSaysWhatPressingItDoes() {
        #expect(TraceLineFold.control(hiddenLines: 129, isExpanded: false) == "Show 129 more lines")
        #expect(TraceLineFold.control(hiddenLines: 1, isExpanded: false) == "Show 1 more line")
        #expect(TraceLineFold.control(hiddenLines: nil, isExpanded: false) == "Show more")
        #expect(TraceLineFold.control(hiddenLines: 129, isExpanded: true) == "Show less")
    }

    @Test func aMediaFoldNamesWhatItMade() {
        func media(_ kind: TraceFoldMember.Media, _ past: String) -> TraceFoldMember {
            TraceFoldMember(label: TraceLabel(past, past), path: nil, media: kind)
        }
        let image = media(.image, "Generated an image")
        let edit = media(.image, "Edited an image")
        let video = media(.video, "Made a video")
        let animated = media(.video, "Animated an image")

        #expect(TraceFoldLabel.label(.image, members: [image, edit]).past == "Generated 2 images")
        #expect(TraceFoldLabel.label(.image, members: [video, animated]).past == "Generated 2 videos")
        #expect(TraceFoldLabel.label(.image, members: [image, video]).past == "Generated 2 images and videos")
        #expect(TraceFoldLabel.label(.image, members: [video, video]).past == "Made a video ×2")
    }

    @Test func aFoldOfDifferentCallsCountsByKind() {
        let read = TraceFoldMember(label: TraceLabel("Read a.md", "Reading a.md"), path: "a.md")
        let other = TraceFoldMember(label: TraceLabel("Read b.md", "Reading b.md"), path: "b.md")

        #expect(TraceFoldLabel.label(.fileRead, members: [read, other]) == TraceLabel("Read 2 files", "Reading 2 files"))
        #expect(TraceFoldLabel.label(.shell, members: [read, other]).past == "Ran 2 commands")
    }

    @Test func aStepDurationHidesNoiseAndTicksWhileRunning() {
        #expect(TraceDuration.step(milliseconds: nil) == nil)
        #expect(TraceDuration.step(milliseconds: nil, isRunning: true) == "0s")
        #expect(TraceDuration.step(milliseconds: 1_900, isRunning: true) == "1s")
        #expect(TraceDuration.step(milliseconds: 400) == nil)
        #expect(TraceDuration.step(milliseconds: 400, showsSubsecond: true) == "400ms")
        #expect(TraceDuration.step(milliseconds: 4_200) == "4.2s")
        #expect(TraceDuration.step(milliseconds: 45_000) == "45s")
        #expect(TraceDuration.step(milliseconds: 102_000) == "1m 42s")
        #expect(TraceDuration.step(milliseconds: 120_000) == "2m")
    }

    @Test func aWorkspacePathLosesItsHostPrefix() {
        let path = TracePath("/Users/zach/.haus/servers/s1/agents/a1/workspace/projects/tinylink/src/shorten.ts")

        #expect(path.name == "shorten.ts")
        #expect(path.dir == "projects/tinylink/src")
        #expect(TracePath.relativize("/Users/zach/.haus/agents/a1/home/notes.md") == "~/notes.md")
        #expect(TracePath.relativize("/Users/zach/.haus/agents/a1/workspace") == "<workspace>")
        #expect(TracePath.basename("README.md") == "README.md")
    }

    @Test func aJournalToolReadsAsItsKindAndTarget() {
        #expect(TraceToolLabel.label(toolName: "Read", input: .object(["file_path": .string("/x/agents/a/workspace/docs/releases.md")])).past == "Read releases.md")
        #expect(TraceToolLabel.label(toolName: "Bash", input: .object(["command": .string("haus message check")])).past == "Checked messages")
        #expect(TraceToolLabel.label(toolName: "exec", input: .object(["command": .array([.string("bash"), .string("-lc"), .string("ls -la")])])).past == "Ran ls -la")
        #expect(TraceToolLabel.label(toolName: "WebFetch", input: .object(["url": .string("https://example.com/a")])).past == "Fetched example.com")
        #expect(TraceToolLabel.kind("mcp__linear__list") == .mcp)
        #expect(TraceToolLabel.kind("Mystery") == .generic)
    }
}
