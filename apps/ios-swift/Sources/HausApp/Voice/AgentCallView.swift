import AVFoundation
import HausTransport
import SwiftUI

struct AgentCallRequest: Identifiable {
    let id: String
    let serverID: String
    let chatID: String
    let agentName: String
}

struct AgentCallView: View {
    let request: AgentCallRequest
    let client: TRPCClient
    @State private var call = VoiceCallSession()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                Image(systemName: "waveform").font(.system(size: 48)).foregroundStyle(.tint)
                Text(request.agentName).font(.largeTitle.weight(.semibold))
                status
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if !call.callerCaption.isEmpty {
                            Text("You").font(.caption).foregroundStyle(.secondary)
                            Text(call.callerCaption)
                        }
                        if !call.agentCaption.isEmpty {
                            Text(request.agentName).font(.caption).foregroundStyle(.secondary)
                            Text(call.agentCaption)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.frame(maxHeight: 240)
                Spacer()
                HStack(spacing: 24) {
                    Button(call.isMuted ? "Unmute" : "Mute", systemImage: call.isMuted ? "mic.slash" : "mic") {
                        call.toggleMute()
                    }.buttonStyle(.bordered).disabled(call.state != .connected)
                    Button("End call", systemImage: "phone.down.fill", role: .destructive) {
                        call.hangUp()
                    }.buttonStyle(.borderedProminent)
                }
                Text("Voice preview · OpenAI audio\nDelegated requests and Agent replies stay in your DM.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding(24)
            .navigationTitle("Call")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
        .task { await call.run(client: client, serverID: request.serverID, chatID: request.chatID) }
        .onChange(of: call.state) { _, state in if state == .ended { dismiss() } }
        .onDisappear { call.release() }
        .onChange(of: scenePhase) { _, phase in if phase == .background { call.hangUp() } }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { _ in call.hangUp() }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { notification in
            if notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                call.hangUp()
            }
        }
    }

    @ViewBuilder private var status: some View {
        switch call.state {
        case .connecting: ProgressView("Connecting…")
        case .connected: Text(call.isMuted ? "Microphone muted" : "Listening").foregroundStyle(.secondary)
        case .ended: Text("Call ended").foregroundStyle(.secondary)
        case .failed(let message): Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
    }
}
