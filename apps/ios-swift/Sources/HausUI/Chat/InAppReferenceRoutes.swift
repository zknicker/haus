import Foundation
import SwiftUI

/// Where a tapped reference goes when its target is a Haus record rather than
/// an address the system can open.
///
/// Transcript rows are hosted in `UIHostingConfiguration` cells, which inherit
/// no custom environment, and the text view that recognizes a link tap is
/// UIKit's. So the App installs its routes here once, at its root, and the text
/// view's link coordinator asks this table before it hands a URL to the system.
/// SwiftUI `Text` links (table cells) reach it through `inAppReferenceRoutes()`,
/// because a hosted cell's default `openURL` would hand a Thread link to the
/// system, which has no app for it. Nothing installed (previews, tests) means the tap does nothing.
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

    /// Runs the in-app action a link stands for. False when the system should
    /// open it instead.
    public static func handle(_ url: URL) -> Bool {
        guard let route = action(for: url) else { return false }
        route()
        return true
    }
}

extension View {
    /// Routes in-app links tapped in this view's SwiftUI `Text` through
    /// `InAppReferenceRoutes`, leaving every other address to the system.
    func inAppReferenceRoutes() -> some View {
        environment(\.openURL, OpenURLAction { url in
            InAppReferenceRoutes.handle(url) ? .handled : .systemAction
        })
    }
}
