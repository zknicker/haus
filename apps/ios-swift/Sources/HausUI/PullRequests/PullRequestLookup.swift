import Foundation
import HausModels

/// Finds the pull request a reference or a citation names among the readings
/// the App holds, so it opens natively instead of in the browser.
public enum PullRequestLookup {
    /// The pull request a GitHub address names: `github.com/<owner>/<repo>/pull/<n>`.
    public static func find(url: URL, in pullRequests: [PullRequestPresentation]) -> PullRequestPresentation? {
        if let exact = pullRequests.first(where: { $0.reading.url == url.absoluteString }) { return exact }
        guard let id = readingID(url) else { return nil }
        return pullRequests.first { $0.id.caseInsensitiveCompare(id) == .orderedSame }
    }

    /// `owner/repo#n`, the id a reading of that address carries.
    static func readingID(_ url: URL) -> String? {
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.count >= 4, parts[2] == "pull", let number = Int(parts[3]), number > 0 else { return nil }
        return "\(parts[0])/\(parts[1])#\(number)"
    }
}
