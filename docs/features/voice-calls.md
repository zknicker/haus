---
summary: Foreground iPhone voice-call preview using GPT-Live with an existing Haus Agent session.
read_when:
  - changing Agent voice calls, live audio, or spoken request delivery
  - connecting a voice model to an existing Agent session
---

# Agent voice calls

The iPhone app exposes a phone button in an existing Agent DM. This proof of
concept uses OpenAI `gpt-live-1` for speech and client delegation, with Vesper
assigned to every Agent when a call starts. The existing
Agent keeps its execution runtime, model, tools, and global session, including
Claude-backed Agents. Its assigned Computer must be healthy and the Agent must
not be stopped or retired.

Haus Server authenticates the call with Clerk and the current App protocol,
checks DM write access, and connects to OpenAI using `HAUS_OPENAI_API_KEY`.
The key remains on Server. This credential needs GPT-Live access and billing;
model-listing permission is not required. Live audio and seeded context leave
Haus for OpenAI even when the backend Agent uses another model vendor.

Live receives the Agent identity, a bounded standing brief, the newest twenty DM
messages within a conservative context budget, and its current turn identifier,
activity category, and execution model. Server refreshes DM messages and activity
once per second. It does not copy the Computer's full execution trace or history
from other chats. Live delegates when that partial context cannot answer a question.

When Live requests delegation, Server waits for a quiet transcription interval,
deduplicates the request, and saves the accumulated spoken excerpt as a human DM
message through normal Haus message delivery. Nearby conversation may be included.
The existing Agent receives it through its ordinary inbox and busy-turn handling.
Committed Agent replies become spoken commentary. Live's conversational filler
and continuous captions are transient, rather than canonical DM messages.

Interrupting speech does not cancel Agent work. Ending the call also leaves
already delivered work running. A session rotation, lost DM permission, stopped
Agent, or unavailable Computer ends the call rather than silently changing its
target. One call per human is allowed on a Server process; preview calls last at
most ten minutes.

The native app captures and plays mono PCM16 at 24 kHz with voice processing for
echo cancellation on physical iPhones. Simulator uses ordinary capture: enabling
voice processing in Device Hub stopped the engine immediately after startup,
yielding no microphone frames. Calls support captions, microphone mute, and hangup.
The call sheet closes when a call ends; connection failures remain visible. Calls end
when the app backgrounds, audio is interrupted, or the current audio device is
removed. Background calling, CallKit, reconnection, and turn-specific cancellation
are outside this preview.

## First-party wire

The authenticated WebSocket is `/voice/call?serverId=…&chatId=…` with the same
Authorization and App protocol headers as other first-party requests. Client
events are `audio`, `mute`, and `close`; Server events are `ready`, `audio`,
`transcript`, `error`, and `closed`. Schemas live in
`packages/haus-api/src/voice.ts`; native projections live in `HausModels`.
Audio fields carry base64 PCM16. Other OpenAI controls are rejected at this boundary.

The external connection uses OpenAI's
[GPT-Live WebSocket protocol](https://developers.openai.com/api/docs/guides/voice-websockets?api=live)
and [client delegation](https://developers.openai.com/api/docs/guides/live-delegation).
`session.thinking.append` supplies quiet state; `session.commentary.append`
supplies Agent results to speak. A graceful hangup sends `session.close` and waits
up to five seconds for `session.closed` before releasing the socket.

## Try it

Run a voice-enabled Haus Server and its connected Computer, launch the iPhone
app against that Server, and open an existing Agent DM. Tap the phone button,
allow microphone access, and ask about the Agent's current work. Ask it to do a
small task, then check that the request and reply appear in the same DM. Test
mute, interruption, and hangup on an iPhone with headphones and speaker audio.
See [Simulator development](../operations/development.md#haus-for-iphone-in-simulator)
for local setup. Simulator compilation and protocol tests cannot establish
real-device audio quality or conversational latency.

CoreAudio tap and playback completion callbacks are explicitly `@Sendable` so
Swift does not inherit the audio owner's main-actor isolation on the audio thread.
Simulator validation caught an executor assertion in the input tap before this fix.

Local validation observed one Simulator RemoteIO startup abort immediately after
the first microphone permission prompt; a subsequent call reached Listening and
passed mute and hangup. Device audio, Bluetooth changes, and first-permission
startup still require iPhone validation.

Simulator diagnosis verified the capture boundary: with voice processing enabled,
the engine was stopped and no chunks were sent; with it disabled, the engine stayed
running, captured PCM was sent, and OpenAI audio replies reached the phone. Mute
also suppresses outgoing microphone chunks, independent of hardware voice processing.
