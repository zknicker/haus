/// A split tab's list column on a wide display (specs/ios-app.md, iPhone
/// Duo): the full list, a 76 pt rail of marks, or hidden beside the detail.
public enum ListColumn: String, CaseIterable, Hashable, Sendable {
    case full
    case rail
    case hidden
}
