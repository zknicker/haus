import Foundation
import HausUI
import SwiftUI

@main
struct HausApp: App {
    @UIApplicationDelegateAdaptor(HausAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if let scene = AvatarGenerationDebugScene.resolve(ProcessInfo.processInfo.arguments) {
                AvatarGenerationDebugPreview(scene: scene)
            } else {
                AuthBoundaryView()
            }
            #else
            AuthBoundaryView()
            #endif
        }
    }
}
