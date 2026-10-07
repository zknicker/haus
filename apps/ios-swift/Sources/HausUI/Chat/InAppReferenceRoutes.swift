import Foundation

/// Where a tapped reference goes when its target is a Haus record rather than
/// an address the system can open.
///
/// Transcript rows are hosted in `UIHostingConfiguration` cells, which inherit
/// no custom environment, and the text view that recognizes a link tap is
/// UIKit's. So the App installs its routes here once, at its root, and the text
/// view's link coordinator asks this table before it hands a URL to the system.
/// Nothing installed (previews, tests) means the tap does nothing.
@MainActor
public enum InAppReferenceRoutes {
    /// Opens a Thread from a Thread reference chip.
    public static var openThread: ((ThreadReferenceTarget) -> Void)?

    /// The in-app action a link stands for, or nil when the system should
    /// open it as an ordinary address.
    public static func action(for url: URL) -> (() -> Void)? {
        guard let thread = ThreadReferenceTarget(url: url) else { return nil }
        return { openThread?(thread) }
    }
}
