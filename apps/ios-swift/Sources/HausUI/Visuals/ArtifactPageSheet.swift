import SwiftUI

/// One artifact page, full height in a sheet: read from the Agent's workspace
/// when the sheet opens, then drawn in the same sandboxed frame a visual uses,
/// scrolling on its own. Blank while it loads; a calm unavailable state, with
/// Try Again where trying again could help, when the Computer cannot answer.
struct ArtifactPageSheet: View {
    let artifact: ArtifactSegment
    let agentID: String
    let onDone: () -> Void

    @State private var result: Result<ArtifactPageFile, ArtifactPageUnavailable>?
    @State private var attempt = 0
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
                .navigationTitle(artifact.displayTitle)
                .hausInlineNavigationTitle()
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", action: onDone)
                    }
                }
        }
        .task(id: attempt) {
            result = await ArtifactPageReader.load(agentID: agentID, path: artifact.path)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch result {
        case nil:
            Color.clear
        case .success(let page):
            VStack(spacing: 0) {
                if page.truncated {
                    Text("This page is larger than Haus can show, so it may be incomplete.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                }
                frame(page)
            }
            .transition(.opacity)
        case .failure(let reason):
            ContentUnavailableView {
                Label(reason.title, systemImage: "doc.text")
            } description: {
                Text(reason.message)
            } actions: {
                if reason.isRetryable {
                    Button("Try Again") {
                        result = nil
                        attempt += 1
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    @ViewBuilder
    private func frame(_ page: ArtifactPageFile) -> some View {
        #if canImport(UIKit)
        VisualWebView(
            document: ArtifactPageDocument.make(
                html: page.html,
                scheme: colorScheme == .light ? .light : .dark
            ),
            scrolls: true,
            onHeight: { _ in }
        )
        .accessibilityLabel(artifact.displayTitle)
        #else
        // macOS exists in this package only so the pure logic runs under `swift test`.
        Color.clear
        #endif
    }
}

#if canImport(UIKit)
import UIKit

/// Puts an artifact page on screen from wherever its card was tapped.
///
/// Transcript rows live in `UIHostingConfiguration` cells, which own no view
/// controller to present from, so the sheet is presented by the frontmost
/// controller of the active window — above the Chat or Thread, never inside
/// the row.
@MainActor
enum ArtifactPagePresenter {
    static func present(_ artifact: ArtifactSegment, agentID: String) {
        guard let presenter = frontmostController() else { return }
        weak var sheet: UIViewController?
        let controller = UIHostingController(
            rootView: ArtifactPageSheet(artifact: artifact, agentID: agentID) {
                sheet?.dismiss(animated: true)
            }
        )
        sheet = controller
        controller.modalPresentationStyle = .pageSheet
        controller.sheetPresentationController?.prefersGrabberVisible = true
        presenter.present(controller, animated: true)
    }

    private static func frontmostController() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        var controller = window?.rootViewController
        while let presented = controller?.presentedViewController, !presented.isBeingDismissed {
            controller = presented
        }
        return controller
    }
}
#else
@MainActor
enum ArtifactPagePresenter {
    static func present(_ artifact: ArtifactSegment, agentID: String) {}
}
#endif
