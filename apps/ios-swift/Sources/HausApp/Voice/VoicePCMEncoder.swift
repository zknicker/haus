import AVFoundation

/// Confined to the input tap's serial audio callbacks; never called on the UI actor.
final class VoicePCMEncoder: @unchecked Sendable {
    private let converter: AVAudioConverter
    private let output: AVAudioFormat

    init(input: AVAudioFormat) throws {
        guard let output = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24_000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: input, to: output) else {
            throw VoiceAudioError.formatUnavailable
        }
        self.output = output
        self.converter = converter
    }

    func encode(_ input: AVAudioPCMBuffer) throws -> Data {
        let capacity = AVAudioFrameCount(ceil(Double(input.frameLength) * output.sampleRate / input.format.sampleRate) + 64)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: capacity) else {
            throw VoiceAudioError.formatUnavailable
        }
        var supplied = false
        var error: NSError?
        converter.convert(to: buffer, error: &error) { _, status in
            if supplied { status.pointee = .noDataNow; return nil }
            supplied = true
            status.pointee = .haveData
            return input
        }
        if let error { throw error }
        guard let samples = buffer.int16ChannelData else { throw VoiceAudioError.formatUnavailable }
        return Data(bytes: samples[0], count: Int(buffer.frameLength) * 2)
    }
}

enum VoiceAudioError: LocalizedError {
    case permissionDenied, formatUnavailable, playbackBehind

    var errorDescription: String? {
        switch self {
        case .permissionDenied: "Allow microphone access in Settings to call your Agent."
        case .formatUnavailable: "The microphone or speaker could not start. Please call again."
        case .playbackBehind: "The audio connection fell behind. Please call again."
        }
    }
}
