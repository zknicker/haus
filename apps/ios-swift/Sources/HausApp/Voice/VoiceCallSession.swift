import Foundation
import HausModels
import HausTransport
import Observation

@MainActor @Observable
final class VoiceCallSession {
    enum State: Equatable { case connecting, connected, ended, failed(String) }
    private(set) var state = State.connecting
    private(set) var callerCaption = ""
    private(set) var agentCaption = ""
    private(set) var isMuted = false
    private let audio = VoiceCallAudio()
    private var socket: URLSessionWebSocketTask?
    private var sender: Task<Void, Never>?
    private var ping: Task<Void, Never>?
    private var closeTimeout: Task<Void, Never>?
    private var closing = false

    func run(client: TRPCClient, serverID: String, chatID: String) async {
        defer { release() }
        do {
            try await audio.requestPermission()
            let request = try await client.voiceCallRequest(serverID: serverID, chatID: chatID)
            try Task.checkCancellation()
            guard !closing else { return }
            let connection = URLSession.shared.webSocketTask(with: request)
            socket = connection
            connection.resume()
            while !Task.isCancelled {
                let message = try await connection.receive()
                let bytes: Data
                switch message {
                case .data(let data): bytes = data
                case .string(let string): bytes = Data(string.utf8)
                @unknown default: throw VoiceAudioError.formatUnavailable
                }
                let event = try JSONDecoder().decode(VoiceCallEvent.self, from: bytes)
                switch event {
                case .ready:
                    guard !closing else { continue }
                    let input = try await audio.start()
                    try Task.checkCancellation()
                    guard !closing else { return }
                    state = .connected
                    sender = Task { [weak self] in
                        do {
                            for try await bytes in input {
                                try Task.checkCancellation()
                                if self?.isMuted == false { try await self?.send(.audio(bytes)) }
                            }
                        } catch {
                            guard !Task.isCancelled else { return }
                            self?.fail("The microphone connection stopped. Please call again.")
                        }
                    }
                    ping = Task { [weak self] in
                        do {
                            while !Task.isCancelled {
                                try await Task.sleep(for: .seconds(10))
                                guard let self else { return }
                                connection.sendPing { [weak self] error in
                                    guard error != nil else { return }
                                    Task { @MainActor in
                                        guard let self, !self.closing else { return }
                                        self.fail("The call lost its connection.")
                                    }
                                }
                            }
                        } catch {
                            guard !Task.isCancelled else { return }
                            self?.fail("The call lost its connection.")
                        }
                    }
                case .audio(let data): if !closing { try audio.play(data) }
                case .transcript(let speaker, let text):
                    if speaker == "user" { callerCaption = String((callerCaption + text).suffix(1200)) }
                    else { agentCaption = String((agentCaption + text).suffix(1200)) }
                case .failure(let message): fail(message); return
                case .closed: if case .failed = state {} else { state = .ended }; return
                }
            }
        } catch {
            if case .failed = state { return }
            if Task.isCancelled || closing { state = .ended }
            else if let audioError = error as? VoiceAudioError { state = .failed(audioError.localizedDescription) }
            else { state = .failed("Couldn't connect the call. Check that the Agent's Computer is online and the Server supports voice calls.") }
        }
    }

    func toggleMute() {
        guard state == .connected, !closing else { return }
        isMuted.toggle()
        audio.mute(isMuted)
        Task {
            do { try await send(.mute(isMuted)) }
            catch { fail("The call lost its connection.") }
        }
    }

    func hangUp() {
        guard !closing else { return }
        closing = true
        audio.stop()
        sender?.cancel()
        ping?.cancel()
        state = .ended
        closeTimeout = Task {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            release()
        }
        Task {
            do { try await send(.close) }
            catch { release() }
        }
    }

    func release() {
        audio.stop()
        sender?.cancel(); sender = nil
        ping?.cancel(); ping = nil
        closeTimeout?.cancel(); closeTimeout = nil
        socket?.cancel(with: .normalClosure, reason: nil); socket = nil
    }

    private func fail(_ message: String) { state = .failed(message); release() }

    private func send(_ command: VoiceCallCommand) async throws {
        guard let socket else { throw CancellationError() }
        let data = try JSONEncoder().encode(command)
        guard let text = String(data: data, encoding: .utf8) else { throw VoiceAudioError.formatUnavailable }
        try await socket.send(.string(text))
    }
}
