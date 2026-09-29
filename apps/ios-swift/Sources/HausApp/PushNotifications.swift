import Foundation
import HausModels
import HausUI
import Observation
import OSLog
import UIKit
import UserNotifications

/// Needs you pushes on this device: the Settings switch, the permission
/// request behind it, the APNs token, and the conversation a tapped
/// notification should open.
///
/// It outlives any one signed-in session because APNs callbacks arrive on the
/// application delegate, possibly before a Store exists — a cold launch from a
/// tap delivers its response first. A Store attaches once signed in and does
/// the Server calls; everything here is local.
@MainActor
@Observable
final class PushNotifications {
    static let shared = PushNotifications()
    static let logger = Logger(subsystem: "chat.haus.ios", category: "push")

    let setting: NeedsYouNotificationsSetting
    /// A tapped notification waiting for the signed-in shell to open it.
    var pendingOpen: PushNotificationPayload?
    /// What the reader is looking at, reported by the shell, so a push for
    /// that very conversation does not banner over it.
    @ObservationIgnored var viewingChatID: String?
    @ObservationIgnored private(set) var deviceToken: String?
    /// The token this Store last told the Server about, so a foreground
    /// re-check does not re-send an unchanged registration.
    @ObservationIgnored private var registeredToken: String?
    /// Switched off, but the Server has not confirmed it; retried until it has.
    @ObservationIgnored private let pendingUnregister = PendingPushUnregister(defaults: .standard)
    @ObservationIgnored private var isUnregistering = false
    @ObservationIgnored private weak var store: HausStore?

    private init() {
        setting = NeedsYouNotificationsSetting(
            isPreferred: UserDefaults.standard.bool(forKey: NeedsYouNotificationsSetting.storageKey)
        )
        setting.onChange = { [weak self] isOn in
            Task { await self?.setPreferred(isOn) }
        }
        setting.onOpenSystemSettings = {
            guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
            UIApplication.shared.open(url)
        }
    }

    /// A signed-in Store takes over the Server side. Re-registering on every
    /// launch is deliberate: APNs may rotate the token, and the Server keys
    /// devices by it.
    func attach(_ store: HausStore) async {
        self.store = store
        registeredToken = nil
        await refreshAuthorization()
    }

    /// Re-reads iOS permission, which the reader can change in the Settings
    /// app at any time, and asks APNs for a token when pushes are on or an
    /// off switch still has to reach the Server.
    func refreshAuthorization() async {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        setting.permission = Self.permission(status)
        if PushDeviceSync.needsToken(isOn: setting.isOn, pendingUnregister: pendingUnregister.isPending) {
            UIApplication.shared.registerForRemoteNotifications()
        }
        syncDevice()
    }

    func didRegister(deviceToken data: Data) {
        deviceToken = PushDeviceToken.hex(data)
        syncDevice()
    }

    /// Mirrors the Needs you count on the app icon, once it is known.
    func updateBadge(needsYouCount: Int, isReady: Bool) {
        guard let count = PushBadge.count(needsYouCount: needsYouCount, isReady: isReady) else { return }
        UNUserNotificationCenter.current().setBadgeCount(count) { error in
            if let error {
                Self.logger.error("Setting the badge failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Opening a conversation answers the notifications grouped under it.
    func clearDelivered(openedChatID: String?) async {
        guard openedChatID != nil else { return }
        let center = UNUserNotificationCenter.current()
        let delivered = await center.deliveredNotifications().map { notification in
            DeliveredPushCleanup.Delivered(
                identifier: notification.request.identifier,
                threadID: notification.request.content.threadIdentifier,
                payload: PushNotificationPayload(userInfo: notification.request.content.userInfo)
            )
        }
        let identifiers = DeliveredPushCleanup.identifiers(delivered, openedChatID: openedChatID)
        if !identifiers.isEmpty {
            center.removeDeliveredNotifications(withIdentifiers: identifiers)
        }
    }

    func foregroundPresentation(for payload: PushNotificationPayload?) -> PushForegroundPresentation {
        PushForegroundPresentation.decide(
            payload,
            viewingServerID: store?.activeServer?.id,
            viewingChatID: viewingChatID
        )
    }

    func open(_ payload: PushNotificationPayload) {
        pendingOpen = payload
    }

    /// Before sign-out ends the session: stop this account's pushes to this
    /// phone. Best effort and bounded, so an unreachable Server never holds
    /// the reader in an account they are leaving.
    func prepareForSignOut() async {
        guard let store,
              let token = PushDeviceSync.signOutUnregisterToken(
                  token: deviceToken,
                  isOn: setting.isOn,
                  pendingUnregister: pendingUnregister.isPending
              )
        else { return }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await store.unregisterPushDevice(token: token) }
            group.addTask { try? await Task.sleep(for: .seconds(3)) }
            await group.next()
            group.cancelAll()
        }
    }

    /// Sign-out failed and the account stays: re-register if the switch is on.
    func signOutFailed() {
        registeredToken = nil
        syncDevice()
    }

    /// After sign-out nothing here belongs to the next account: it opts in
    /// itself, and an unregister still pending can no longer be answered.
    func didSignOut() {
        store = nil
        registeredToken = nil
        pendingOpen = nil
        viewingChatID = nil
        pendingUnregister.isPending = false
        persistPreference(false)
        let center = UNUserNotificationCenter.current()
        center.removeAllDeliveredNotifications()
        center.setBadgeCount(0)
    }

    /// The switch asks iOS first and only reads on once granted, like the
    /// App's toggle; off tells the Server to stop pushing to this phone.
    private func setPreferred(_ isOn: Bool) async {
        guard isOn else {
            persistPreference(false)
            registeredToken = nil
            pendingUnregister.isPending = true
            await refreshAuthorization()
            return
        }
        setting.isRequesting = true
        defer { setting.isRequesting = false }
        let granted: Bool
        do {
            granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            Self.logger.error("Notification permission failed: \(error.localizedDescription, privacy: .public)")
            granted = false
        }
        if granted {
            persistPreference(true)
            pendingUnregister.isPending = false
        }
        await refreshAuthorization()
    }

    /// Tells the signed-in Server what the switch says about this token.
    private func syncDevice() {
        guard let store else { return }
        let action = PushDeviceSync.action(
            isOn: setting.isOn,
            pendingUnregister: pendingUnregister.isPending,
            token: deviceToken,
            registeredToken: registeredToken
        )
        guard let token = deviceToken else { return }
        switch action {
        case .register:
            registeredToken = token
            Task { await store.registerPushDevice(token: token, environment: Self.environment) }
        case .unregister:
            guard !isUnregistering else { return }
            isUnregistering = true
            Task {
                let heard = await store.unregisterPushDevice(token: token)
                isUnregistering = false
                // Switched back on meanwhile: the register already won.
                if heard, !setting.isPreferred { pendingUnregister.isPending = false }
            }
        case .none:
            break
        }
    }

    private func persistPreference(_ isOn: Bool) {
        setting.isPreferred = isOn
        UserDefaults.standard.set(isOn, forKey: NeedsYouNotificationsSetting.storageKey)
    }

    private static func permission(_ status: UNAuthorizationStatus) -> NotificationPermission {
        switch status {
        case .authorized, .provisional, .ephemeral: .granted
        case .denied: .denied
        case .notDetermined: .undetermined
        @unknown default: .undetermined
        }
    }

    /// Which APNs gateway issued this build's tokens; see `PushEnvironment`.
    static let environment: PushEnvironment = {
        #if targetEnvironment(simulator)
        let isSimulator = true
        #else
        let isSimulator = false
        #endif
        let profile = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision")
            .flatMap { try? Data(contentsOf: $0) }
        return PushEnvironment.resolve(
            signature: PushEnvironment.signature(embeddedProfile: profile),
            isSimulator: isSimulator
        )
    }()
}
