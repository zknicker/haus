import AVFoundation

@MainActor
final class VoiceCallAudio {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var installedTap = false
    private var queuedFrames = 0
    private var playbackGeneration = 0

    func requestPermission() async throws {
        guard await AVAudioApplication.requestRecordPermission() else { throw VoiceAudioError.permissionDenied }
        try Task.checkCancellation()
    }

    func start() async throws -> AsyncThrowingStream<Data, Error> {
        try Task.checkCancellation()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)
        do {
            // Simulator voice processing can stop the engine immediately after startup.
            #if targetEnvironment(simulator)
            try engine.inputNode.setVoiceProcessingEnabled(false)
            #else
            try engine.inputNode.setVoiceProcessingEnabled(true)
            #endif
            let encoder = try VoicePCMEncoder(input: engine.inputNode.outputFormat(forBus: 0))
            let (stream, continuation) = AsyncThrowingStream<Data, Error>.makeStream(bufferingPolicy: .bufferingNewest(20))
            engine.inputNode.installTap(onBus: 0, bufferSize: 2400, format: nil) { @Sendable buffer, _ in
                do {
                    let data = try encoder.encode(buffer)
                    if !data.isEmpty {
                        if case .dropped = continuation.yield(data) {
                            continuation.finish(throwing: VoiceAudioError.playbackBehind)
                        }
                    }
                } catch { continuation.finish(throwing: error) }
            }
            installedTap = true
            engine.attach(player)
            let format = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            engine.prepare()
            try engine.start()
            player.play()
            guard engine.isRunning else { throw VoiceAudioError.formatUnavailable }
            return stream
        } catch { stop(); throw error }
    }

    func play(_ data: Data) throws {
        let count = data.count / 2
        guard queuedFrames + count <= 48_000 else { throw VoiceAudioError.playbackBehind }
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)),
              let samples = buffer.floatChannelData else { throw VoiceAudioError.formatUnavailable }
        buffer.frameLength = AVAudioFrameCount(count)
        data.withUnsafeBytes { bytes in
            for index in 0..<count {
                let value = bytes.loadUnaligned(fromByteOffset: index * 2, as: Int16.self)
                samples[0][index] = Float(Int16(littleEndian: value)) / 32_768
            }
        }
        queuedFrames += count
        let generation = playbackGeneration
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { @Sendable [weak self] _ in
            Task { @MainActor in
                guard let self, self.playbackGeneration == generation else { return }
                self.queuedFrames = max(0, self.queuedFrames - count)
            }
        }
    }

    func mute(_ muted: Bool) {
        if engine.inputNode.isVoiceProcessingEnabled { engine.inputNode.isVoiceProcessingInputMuted = muted }
    }

    func stop() {
        if installedTap { engine.inputNode.removeTap(onBus: 0); installedTap = false }
        player.stop()
        engine.stop()
        playbackGeneration += 1
        queuedFrames = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
