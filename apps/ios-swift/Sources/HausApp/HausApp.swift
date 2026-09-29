import ClerkKit
import Foundation
import HausUI
import SwiftUI

@main
struct HausApp: App {
    @UIApplicationDelegateAdaptor(HausAppDelegate.self) private var appDelegate

    init() {
        Clerk.configure(
            publishableKey: HausRuntimeConfiguration.clerkPublishableKey,
            options: .init(
                redirectConfig: .init(
                    redirectUrl: "haus://sso-callback",
                    callbackUrlScheme: "haus"
                )
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if let scene = AvatarGenerationDebugScene.resolve(ProcessInfo.processInfo.arguments) {
                AvatarGenerationDebugPreview(scene: scene)
            } else {
                AuthBoundaryView()
                    .environment(Clerk.shared)
            }
            #else
            AuthBoundaryView()
                .environment(Clerk.shared)
            #endif
        }
    }
}
