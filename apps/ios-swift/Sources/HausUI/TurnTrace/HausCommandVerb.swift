import Foundation

/// Reads a `haus` Agent CLI call as the product action it is. Ported from the App's
/// `turn-trace-haus-command.ts`; targets follow the CLI's `#channel` / `dm:@peer` grammar, where a
/// trailing `:<shortId>` addresses a thread.
enum HausCommandVerb {
    /// The verb for one `haus …` command line, or nil when it has none.
    static func read(_ text: String) -> TraceLabel? {
        let words = tokenize(text)
        let group = words.count > 1 ? words[1] : ""
        let subcommand = words.count > 2 && !words[2].hasPrefix("-") ? words[2] : ""
        if group == "message", subcommand == "send" {
            return sendVerb(flags: readFlags(Array(words.dropFirst(3))))
        }
        return verbs["\(group) \(subcommand)".traceTrimmed] ?? verbs[group]
    }

    private static let verbs: [String: TraceLabel] = [
        "attachment upload": TraceLabel("Uploaded a file", "Uploading a file"),
        "claim": TraceLabel("Claimed a message", "Claiming a message"),
        "claim assign": TraceLabel("Assigned a claim", "Assigning a claim"),
        "claim create": TraceLabel("Created a claim", "Creating a claim"),
        "claim list": TraceLabel("Listed claims", "Listing claims"),
        "claim release": TraceLabel("Released a claim", "Releasing a claim"),
        "claim unassign": TraceLabel("Unassigned a claim", "Unassigning a claim"),
        "claim update": TraceLabel("Updated a claim", "Updating a claim"),
        "inbox check": TraceLabel("Checked inbox", "Checking inbox"),
        "message check": TraceLabel("Checked messages", "Checking messages"),
        "message follow": TraceLabel("Followed a thread", "Following a thread"),
        "message react": TraceLabel("Reacted", "Reacting"),
        "message read": TraceLabel("Read messages", "Reading messages"),
        "message resolve": TraceLabel("Looked up a message", "Looking up a message"),
        "message search": TraceLabel("Searched messages", "Searching messages"),
        "message send": TraceLabel("Sent a message", "Sending a message"),
        "message unfollow": TraceLabel("Unfollowed a thread", "Unfollowing a thread"),
        "reminder cancel": TraceLabel("Cancelled a reminder", "Cancelling a reminder"),
        "reminder list": TraceLabel("Listed reminders", "Listing reminders"),
        "reminder schedule": TraceLabel("Set a reminder", "Setting a reminder"),
        "reminder snooze": TraceLabel("Snoozed a reminder", "Snoozing a reminder"),
        "reminder update": TraceLabel("Updated a reminder", "Updating a reminder"),
        "thread unfollow": TraceLabel("Unfollowed a thread", "Unfollowing a thread"),
    ]

    /// Flags that take a value; every other `--flag` is a switch.
    private static let valueFlags: Set<String> = ["--attachment-id", "--cause", "--reply-to", "--target"]
    private static let operatorChars: Set<Character> = [";", "|", "&", "<", ">"]
    private static let directMessage = TraceRegex(#"^dm:@[^:]+(:.+)?$"#)
    private static let channel = TraceRegex(#"^(#[^:]+)(:.+)?$"#)

    private static func sendVerb(flags: [String: String]) -> TraceLabel {
        guard let target = flags["--target"] else { return TraceLabel("Sent a message", "Sending a message") }
        let place = readPlace(target)
        if place.isThread { return TraceLabel("Replied in thread", "Replying in thread") }
        if flags["--reply-to"] != nil {
            return TraceLabel("Replied in \(place.name)", "Replying in \(place.name)")
        }
        return TraceLabel("Sent a message to \(place.name)", "Sending a message to \(place.name)")
    }

    /// A DM reads as `DM`, never the peer's name.
    private static func readPlace(_ target: String) -> (isThread: Bool, name: String) {
        if let match = directMessage.firstMatch(in: target) { return (match[1] != nil, "DM") }
        if let match = channel.firstMatch(in: target), let name = match[1] { return (match[2] != nil, name) }
        return (false, target)
    }

    private static func readFlags(_ words: [String]) -> [String: String] {
        var values: [String: String] = [:]
        var index = 0
        while index < words.count {
            let word = words[index]
            if let first = word.first, operatorChars.contains(first) { break }
            if word.hasPrefix("--") {
                if let equals = word.firstIndex(of: "="), equals > word.startIndex {
                    values[String(word[..<equals])] = String(word[word.index(after: equals)...])
                } else if valueFlags.contains(word), index + 1 < words.count {
                    values[word] = words[index + 1]
                    index += 1
                } else {
                    values[word] = ""
                }
            }
            index += 1
        }
        return values
    }

    /// Shell words with quotes removed. An unquoted operator run becomes its own word.
    static func tokenize(_ line: String) -> [String] {
        let chars = Array(line)
        var words: [String] = []
        var current = ""
        var hasWord = false
        var index = 0
        func flush() {
            if hasWord { words.append(current) }
            current = ""
            hasWord = false
        }
        while index < chars.count {
            let char = chars[index]
            if char == "\"" || char == "'" {
                var end = index + 1
                while end < chars.count, chars[end] != char {
                    if char == "\"", chars[end] == "\\", end + 1 < chars.count { end += 1 }
                    current.append(chars[end])
                    end += 1
                }
                hasWord = true
                index = end + 1
            } else if char == "\\", index + 1 < chars.count {
                current.append(chars[index + 1])
                hasWord = true
                index += 2
            } else if char.isWhitespace {
                flush()
                index += 1
            } else if operatorChars.contains(char) {
                flush()
                var end = index + 1
                while end < chars.count, operatorChars.contains(chars[end]) { end += 1 }
                words.append(String(chars[index..<end]))
                index = end
            } else {
                current.append(char)
                hasWord = true
                index += 1
            }
        }
        flush()
        return words
    }
}
