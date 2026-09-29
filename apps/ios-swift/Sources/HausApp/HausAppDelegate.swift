import HausModels
import OSLog
import UIKit
import UserNotifications

/// The UIKit edge for remote notifications. APNs hands the device token and
/// notification callbacks only to an application delegate, so this stays a
/// thin relay into `PushNotifications`, which owns every decision.
final class HausAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set before launch finishes so a tap that cold-launched the app is
        // delivered to `didReceive` rather than dropped.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        PushNotifications.shared.didRegister(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        PushNotifications.logger.error(
            "APNs registration failed: \(error.localizedDescription, privacy: .public)"
        )
    }

    // Completion-handler forms, not the `async` ones: the async bridge calls
    // UIKit's completion off the main thread, and a tapped notification then
    // aborts in `_performBlockAfterCATransactionCommitSynchronizes`.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void
    ) {
        let payload = PushNotificationPayload(userInfo: notification.request.content.userInfo)
        Task { @MainActor in
            switch PushNotifications.shared.foregroundPresentation(for: payload) {
            case .suppress:
                completionHandler([])
            case .banner:
                completionHandler([.banner, .list, .sound])
            }
        }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping @Sendable () -> Void
    ) {
        let payload = response.actionIdentifier == UNNotificationDefaultActionIdentifier
            ? PushNotificationPayload(userInfo: response.notification.request.content.userInfo)
            : nil
        Task { @MainActor in
            if let payload {
                PushNotifications.shared.open(payload)
            }
            completionHandler()
        }
    }
}
