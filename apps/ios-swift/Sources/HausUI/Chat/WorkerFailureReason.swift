import Foundation

extension WorkerPresentation {
    /// The provider's own report, else its error code, as one readable line.
    static func failureReason(errorCode: String?, summary: String?) -> String {
        if let line = summary.flatMap(oneLine) { return line }
        if let errorCode {
            let words = errorCode.replacingOccurrences(of: #"[_-]+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            if let first = words.first { return first.uppercased() + words.dropFirst() }
        }
        return "The run failed without a reason"
    }

    /// Markdown a provider wrote, as the one flat line a surface can show.
    static func oneLine(_ text: String) -> String? {
        let line = RichMessageParser.oneLinePreview(text)
        return line.isEmpty ? nil : line
    }
}
