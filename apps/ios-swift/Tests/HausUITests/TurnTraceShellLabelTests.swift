import Foundation
@testable import HausUI
import Testing

/// Adapted from the App's `apps/website/src/features/turn-trace/turn-trace-shell-label.test.ts`.
struct TurnTraceShellLabelTests {
    private func label(_ command: String, _ tense: TraceTense = .past) -> String {
        ShellLabel.format(command, tense: tense)
    }

    @Test func aHeredocBodyIsNeverReadAsACommand() {
        #expect(label("/bin/zsh -lc \"haus message send --target \\\"#all\\\" <<'HAUSMSG'\nrm -rf /\nHAUSMSG\"") == "Sent a message to #all")
        #expect(label("cat > notes.md <<EOF\nnpm test\nEOF") == "Wrote notes.md")
        #expect(label("node -e 'console.log(1 << 3)'") == "Ran node -e 'console.log(1 << 3)'")
    }

    @Test func aLongCommandIsCappedSoTheRowStaysOneLine() {
        let capped = label("rg \(Array(repeating: "pattern", count: 30).joined(separator: " "))")

        #expect(capped.count == 84)
        #expect(capped.hasPrefix("Ran rg pattern"))
        #expect(capped.hasSuffix("…"))
    }

    @Test func aHausCommandReadsAsTheProductActionItIs() {
        #expect(label(##"/bin/zsh -lc "haus message send --target \"#all\" <<'HAUSMSG'""##) == "Sent a message to #all")
        #expect(label(##"/bin/zsh -lc 'haus message send --send-draft --target "#all"'"##) == "Sent a message to #all")
        #expect(label("zsh -lc 'haus message check'") == "Checked messages")
        #expect(label("zsh -lc 'haus inbox check'") == "Checked inbox")
        #expect(label("haus claim --number 3") == "Claimed a message")
        #expect(label("haus claim update --number 3 --status done") == "Updated a claim")
        #expect(label(##"haus message react --target "#all" --message-id 1a"##) == "Reacted")
        #expect(label("haus reminder schedule --delay-seconds 60") == "Set a reminder")
    }

    @Test func aSentMessageNamesWhereItWentAndADMIsDM() {
        func send(_ flags: String) -> String {
            label("haus message send \(flags) --done <<'HAUSMSG'\nHi\nHAUSMSG")
        }
        #expect(send("--target dm:@zach-knickerbocker") == "Sent a message to DM")
        #expect(send("--target '#product'") == "Sent a message to #product")
        #expect(send("--target=#product") == "Sent a message to #product")
        #expect(send("--target dm:@zach-knickerbocker --reply-to 1a2b3c4d") == "Replied in DM")
        #expect(send(##"--target "#product" --reply-to 1a2b3c4d"##) == "Replied in #product")
        #expect(send(##"--target "#product:1a2b3c4d""##) == "Replied in thread")
        #expect(send("--target dm:@zach:1a2b3c4d") == "Replied in thread")
        #expect(ShellLabel.read("haus message send --target dm:@zach <<'HAUSMSG'\nHi\nHAUSMSG").present == "Sending a message to DM")
    }

    @Test func aHausCommandWithNoVerbStillStatesWhatRan() {
        #expect(label("haus skill list") == "Ran haus skill list")
        #expect(label("haus claim --help") == "Read haus help")
        #expect(label("zsh -lc 'ls -la'") == "Ran ls -la")
        #expect(label("   ") == "Ran a command")
    }

    @Test func aScriptThatClaimedWroteAndTestedReadsAsTheWork() {
        let read = ShellLabel.read(Self.setupCommand)

        #expect(read.past == "Wrote 7 files, ran npm test")
        #expect(read.present == "Writing 7 files, running npm test")
        #expect(read.extraCommands == 2)
        #expect(read.lines == 10)
    }

    @Test func aHausCallBesideRealCommandsNeverNamesTheRow() {
        #expect(label("haus claim --help 2>&1 | head -5; node --version; which bun") == "Ran node --version")
        #expect(ShellLabel.read("haus claim --help; node --version; which bun").extraCommands == 1)
    }

    @Test func anAllHausScriptReadsAsItsFirstRealVerb() {
        let read = ShellLabel.read("haus message send --target dm:@zach <<'HAUSMSG'\nDone.\nHAUSMSG\nhaus claim update --help")

        #expect(read.past == "Sent a message to DM")
        #expect(read.extraCommands == 1)
    }

    @Test func setupIsSkippedAndATestRunnerOutranksOtherCommands() {
        #expect(label(#"cd projects/tinylink && cat src/missing.ts; echo "exit=$?""#) == "Ran cat src/missing.ts")
        #expect(label("cd app && ls src\nbun test --filter trace\necho done") == "Ran bun test --filter trace")
        #expect(label("cd app && export X=1") == "Ran a script")
    }

    @Test func aOneLineCommandReadsAsTyped() {
        #expect(label("sleep 45 && echo done") == "Ran sleep 45 && echo done")
        #expect(label("sleep 45 && echo done", .present) == "Running sleep 45 && echo done")
        #expect(label(#"/bin/zsh -lc "rg -n 'x' src | head -3""#) == "Ran rg -n 'x' src | head -3")
    }

    @Test func aRedirectInsideQuotedCodeIsNotAFileWrite() {
        #expect(label("cd app && node -e 'if (a > b) console.log(1)'") == "Ran node -e 'if (a > b) console.log(1)'")
        #expect(label(#"cd app && echo "x" > "out file.txt""#) == "Wrote out file.txt")
    }

    @Test func controlFlowNeverNamesARow() {
        let script = "cd \"$PWD\" && pwd | sed \"s|.*/workspace|<workspace>|\"\nif [ -d packages ]; then\n  find packages -type f | wc -l\nelse\n  echo absent; exit 1\nfi"
        let read = ShellLabel.read(script)

        #expect(read.past == "Counted files in packages")
        #expect(read.extraCommands == 1)
        #expect(label("for f in src/*.ts; do\n  wc -l \"$f\"\ndone") == "Ran wc -l \"$f\"")
        #expect(label("while read line; do echo \"$line\"; done < list.txt") == "Ran read line")
    }

    @Test func aPipelineWithAPlainerNameReadsAsItsPurpose() {
        #expect(label("find packages -type f | wc -l") == "Counted files in packages")
        #expect(label(#"find . -name "*.ts" | wc -l"#) == "Counted files")
        #expect(label("find packages -type f | head") == "Ran find packages -type f | head")
    }

    @Test func aHeredocScriptNamesItsLanguageAndQuotesItsFirstWorkingLine() {
        let python = ShellLabel.read("cd projects/tinylink && python3 - <<'PY'\nimport json\n\n# check codes\nprint(len(codes))\nPY")

        #expect(python.past == "Ran a Python script")
        #expect(python.present == "Running a Python script")
        #expect(python.detail == "print(len(codes))")
        #expect(python.extraCommands == 0)
        #expect(ShellLabel.read("/bin/zsh -lc \"node <<'JS'\nconst fs = require('fs')\nfs.rmSync('x')\nJS\"").past == "Ran a Node script")
        #expect(label("python3 build.py") == "Ran python3 build.py")
        #expect(ShellLabel.read("python3 build.py").detail == nil)
    }

    /// The App's `setupCommand` fixture (`turn-trace-claude-fixtures.ts`).
    static let setupCommand = (
        [
            "haus claim --target dm:@zach-knickerbocker --message-id 5QKFt9Q4 2>&1 | tail -3",
            "mkdir -p projects/tinylink/src projects/tinylink/test && cd projects/tinylink",
        ]
            + [
                "package.json", "tsconfig.json", "src/validate.ts", "src/shorten.ts", "src/index.ts",
                "test/shorten.test.ts", "README.md",
            ].flatMap { file in
                ["cat > \(file) <<'EOF'", "{", "  \"x\": 1; haus claim && echo nope", "}", "EOF"]
            }
            + ["npm test 2>&1 | tail -15; cat src/*.ts test/*.ts README.md package.json tsconfig.json | wc -l"]
    ).joined(separator: "\n")
}
