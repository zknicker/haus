import SwiftUI
import UIKit

/// Chat routes hide the navigation bar and draw their own header, which turns
/// off UIKit's edge-swipe back. While a chat is on screen this answers the
/// gesture itself, allowing it whenever there is a screen to go back to, and
/// hands the gesture back on the way out. Remove it once a hidden bar keeps
/// the stock gesture.
struct InteractivePopRestorer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller {
        Controller()
    }

    func updateUIViewController(_ controller: Controller, context: Context) {}

    final class Controller: UIViewController, UIGestureRecognizerDelegate {
        private weak var previousDelegate: UIGestureRecognizerDelegate?
        private weak var navigation: UINavigationController?

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard let navigation = navigationController, let gesture = navigation.interactivePopGestureRecognizer else {
                return
            }
            self.navigation = navigation
            if gesture.delegate !== self { previousDelegate = gesture.delegate }
            gesture.delegate = self
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            guard let gesture = navigation?.interactivePopGestureRecognizer, gesture.delegate === self else { return }
            gesture.delegate = previousDelegate
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            (navigation?.viewControllers.count ?? 0) > 1
        }
    }
}
