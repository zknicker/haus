import Foundation

/// How a compound script names its row: writes fold into a count, and the heaviest other command
/// names the rest.
enum ShellLabelCompound {
    static func label(
        _ commands: [ShellCommand],
        describe: (ShellCommand) -> TraceLabel?
    ) -> (label: TraceLabel, extra: Int) {
        let writes = commands.filter { $0.writes != nil }
        let others = commands.filter { $0.writes == nil }
        let best = others.reduce(nil as ShellCommand?) { winner, entry in
            if let winner, weigh(winner) >= weigh(entry) { winner } else { entry }
        }
        let extra = max(0, others.count - 1)
        let wrote = writes.count == 1 ? TracePath.basename(writes[0].writes ?? "") : "\(writes.count) files"
        let idiom = best.flatMap(describe)
        let ran = best.map { ShellLabel.clamp($0.text) }

        if !writes.isEmpty, let ran {
            return (
                TraceLabel(
                    "Wrote \(wrote), \(idiom.map { lowerFirst($0.past) } ?? "ran \(ran)")",
                    "Writing \(wrote), \(idiom.map { lowerFirst($0.present) } ?? "running \(ran)")"
                ),
                extra
            )
        }
        if !writes.isEmpty { return (TraceLabel("Wrote \(wrote)", "Writing \(wrote)"), 0) }
        if let idiom { return (idiom, extra) }
        if let ran { return (TraceLabel("Ran \(ran)", "Running \(ran)"), extra) }
        return (TraceLabel("Ran a script", "Running a script"), 0)
    }

    /// A pipeline whose purpose has a plainer name than its syntax:
    /// `find packages -type f | wc -l` counted the files in packages.
    static func idiom(_ commands: [ShellCommand], head: ShellCommand) -> TraceLabel? {
        let next = head.position + 1
        guard head.program == "find", next < commands.count,
              commands[next].piped, ShellLabelPatterns.lineCount.contains(commands[next].text)
        else { return nil }
        let words = head.text.traceWords
        let root = words.count > 1 ? words[1] : nil
        let place = root.map { root in
            !root.hasPrefix("-") && root != "." ? " in \(root.hasSuffix("/") ? String(root.dropLast()) : root)" : ""
        } ?? ""
        return TraceLabel("Counted files\(place)", "Counting files\(place)")
    }

    private static let minorPrograms: Set<String> = ["chmod", "ls", "mkdir", "pwd", "rm", "touch", "which"]

    private static func weigh(_ command: ShellCommand) -> Int {
        if ShellLabelPatterns.runnerCommand.contains(command.text) { return 3 }
        return minorPrograms.contains(command.program) ? 1 : 2
    }

    private static func lowerFirst(_ value: String) -> String {
        value.prefix(1).lowercased() + value.dropFirst()
    }
}
