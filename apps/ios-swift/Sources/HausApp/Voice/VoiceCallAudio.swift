import AVFoundation

@MainActor
final class VoiceCallAudio {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var installedTap = false
    private var queuedFrames = 0
    private var playbackGeneration = 0
    private var configurationObserver: NSObjectProtocol?
    private var inputContinuation: AsyncThrowingStream<Data, Error>.Continuation?
    private var startupContinuation: AsyncThrowingStream<Void, Error>.Continuation?
    private var captureFormat: AVAudioFormat?

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
            let inputFormat = engine.inputNode.outputFormat(forBus: 0)
            captureFormat = inputFormat
            let encoder = try VoicePCMEncoder(input: inputFormat)
            let (stream, continuation) = AsyncThrowingStream<Data, Error>.makeStream(bufferingPolicy: .bufferingNewest(20))
            let (capture, started) = AsyncThrowingStream<Void, Error>.makeStream(bufferingPolicy: .bufferingNewest(1))
            inputContinuation = continuation
            startupContinuation = started
            engine.inputNode.installTap(onBus: 0, bufferSize: 2400, format: nil) { @Sendable buffer, _ in
                do {
                    let data = try encoder.encode(buffer)
                    if !data.isEmpty {
                        started.yield(())
                        started.finish()
                        if case .dropped = continuation.yield(data) {
                            continuation.finish(throwing: VoiceAudioError.playbackBehind)
                        }
                    }
                } catch { started.finish(throwing: error); continuation.finish(throwing: error) }
            }
            installedTap = true
            engine.attach(player)
            let format = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            configurationObserver = NotificationCenter.default.addObserver(
                forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
            ) { @Sendable [weak self] _ in
                Task { @MainActor in self?.resumeAfterConfigurationChange() }
            }
            engine.prepare()
            try engine.start()
            // Voice processing can reconfigure and stop the engine after start returns.
            try await VoiceAudioStartup.waitForCapture(capture)
            try Task.checkCancellation()
            guard installedTap, engine.isRunning else { throw VoiceAudioError.formatUnavailable }
            return stream
        } catch {
            stop()
            if error is VoiceAudioStartup.Failure { throw VoiceAudioError.formatUnavailable }
            throw error
        }
    }

    func play(_ data: Data) throws {
        guard installedTap, engine.isRunning,
              engine.outputNode.lastRenderTime?.isSampleTimeValid == true else {
            throw VoiceAudioError.formatUnavailable
        }
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
        if !player.isPlaying { player.play() }
    }

    func mute(_ muted: Bool) {
        if engine.inputNode.isVoiceProcessingEnabled { engine.inputNode.isVoiceProcessingInputMuted = muted }
    }

    func stop() {
        if let configurationObserver {
            NotificationCenter.default.removeObserver(configurationObserver)
            self.configurationObserver = nil
        }
        startupContinuation?.finish(); startupContinuation = nil
        inputContinuation?.finish(); inputContinuation = nil
        captureFormat = nil
        if installedTap { engine.inputNode.removeTap(onBus: 0); installedTap = false }
        player.stop()
        engine.stop()
        playbackGeneration += 1
        queuedFrames = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func resumeAfterConfigurationChange() {
        guard installedTap else { return }
        playbackGeneration += 1
        queuedFrames = 0
        player.stop()
        do {
            guard engine.inputNode.outputFormat(forBus: 0) == captureFormat else {
                throw VoiceAudioError.formatUnavailable
            }
            if !engine.isRunning { try engine.start() }
        } catch {
            startupContinuation?.finish(throwing: error)
            inputContinuation?.finish(throwing: error)
            stop()
        }
    }
}
