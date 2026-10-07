import SwiftUI

#if canImport(UIKit)
import UIKit
import WebKit

/// The native frame a visual renders in: a `WKWebView` loaded from a string
/// with a nil base URL, which is the opaque origin the web card gets from
/// `sandbox` without `allow-same-origin`. Nothing in the document can reach
/// app state, and every navigation after the initial load is refused.
struct VisualWebView: UIViewRepresentable {
    let document: String
    /// An inline card leaves vertical scrolling to the transcript; a full
    /// page (an artifact) scrolls itself.
    var scrolls = false
    let onHeight: (CGFloat) -> Void

    /// Every visual frame shares one non-persistent store. A store per view is
    /// a WebContent process per card, and a transcript of visuals would spawn
    /// one for each; sharing is safe precisely because the documents load with
    /// `baseURL: nil`, so each is its own null origin with no cookies, storage,
    /// or cache to reach across. (`WKProcessPool` is not the other half of this
    /// any more — it has been deprecated and inert since iOS 15.)
    @MainActor private static let sharedDataStore = WKWebsiteDataStore.nonPersistent()

    func makeCoordinator() -> Coordinator {
        Coordinator(onHeight: onHeight)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = Self.sharedDataStore
        configuration.suppressesIncrementalRendering = false
        configuration.userContentController.add(
            context.coordinator,
            name: VisualSandboxDocument.sizeMessageName
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = scrolls
        webView.scrollView.bounces = scrolls
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.load(document, into: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onHeight = onHeight
        context.coordinator.load(document, into: webView)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.navigationDelegate = nil
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: VisualSandboxDocument.sizeMessageName
        )
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var onHeight: (CGFloat) -> Void
        private var loadedDocument: String?
        /// Only the load this coordinator started is allowed through; it is
        /// re-armed for each reload so a streaming body can reparse.
        private var awaitingOwnLoad = false

        init(onHeight: @escaping (CGFloat) -> Void) {
            self.onHeight = onHeight
        }

        func load(_ document: String, into webView: WKWebView) {
            guard loadedDocument != document else { return }
            loadedDocument = document
            awaitingOwnLoad = true
            webView.loadHTMLString(document, baseURL: nil)
        }

        func userContentController(
            _ controller: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == VisualSandboxDocument.sizeMessageName,
                  let height = message.body as? NSNumber else { return }
            onHeight(CGFloat(truncating: height))
        }

        /// The frame navigates exactly once, to the document we handed it.
        /// A link the model wrote opens in the system browser when it is
        /// http(s) and is refused otherwise; nothing navigates the frame away.
        /// The rule itself is `VisualNavigationPolicy`, so it can be tested.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
        ) {
            switch VisualNavigationPolicy.decide(
                isAwaitingOwnLoad: awaitingOwnLoad,
                isMainFrame: action.targetFrame?.isMainFrame == true,
                navigationType: action.navigationType,
                url: action.request.url
            ) {
            case .allow:
                awaitingOwnLoad = false
                decisionHandler(.allow)
            case let .openExternally(url):
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            case .cancel:
                decisionHandler(.cancel)
            }
        }
    }
}

#endif
