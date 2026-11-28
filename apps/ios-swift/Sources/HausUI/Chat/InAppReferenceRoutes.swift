import Foundation
import HausModels
import SwiftUI

/// Where a tapped reference goes when its target is a Haus record rather than
/// an address the system can open.
///
/// Transcript rows are hosted in `UIHostingConfiguration` cells, which inherit
/// no custom environment, and the text view that recognizes a link tap is
/// UIKit's. So the App installs its routes here once, at its root, and the text
/// view's link coordinator asks this table before it hands a URL to the system.
/// SwiftUI `Text` links (table cells) reach it through `inAppReferenceRoutes()`,
/// system, which has no app for it. Nothing installed (previews, tests) means the tap does nothing.
@MainActor
public enum InAppReferenceRoutes {
    public static var openMessage: ((MessageReferenceTarget) -> Void)?
    /// Opens a Task from a Task reference chip.
    public static var openTask: ((TaskReferenceTarget) -> Void)?
    /// The native open for a pull request address the App holds a reading
    /// for; nil leaves the address to the system browser.
    public static var openPullRequest: ((URL) -> (() -> Void)?)?
    /// The native Drive open for a library link whose file the App knows; nil
    /// keeps the artifact viewer.
    public static var openDriveArtifact: ((SharedArtifactLinkTarget) -> (() -> Void)?)?

    /// The in-app action a link stands for, or nil when the system should
    /// open it as an ordinary address.
    public static func action(for url: URL) -> (() -> Void)? {
        if let artifact = SharedArtifactLinkTarget(inAppURL: url) {
            return openDriveArtifact?(artifact) ?? { SharedArtifactPresenter.present(artifact) }
        }
        if let task = TaskReferenceTarget(url: url) {
            return { openTask?(task) }
        }
        if RichReferenceWireForm.pullRequestNumber(in: url.absoluteString) != nil,
           let open = openPullRequest?(url) {
            return open
        }
        guard let message = MessageReferenceTarget(url: url) else { return nil }
        return { openMessage?(message) }
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
