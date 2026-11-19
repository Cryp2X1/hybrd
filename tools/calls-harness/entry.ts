// Browser harness for tools/test-calls-webrtc.mjs: exposes the real call engine on window for puppeteer.
import { CallEngine, MemoryBus, blankVideoTrack } from '../../src/lib/callEngine';
import { MAX_CALL_PEOPLE } from '../../src/lib/calls';
(window as unknown as Record<string, unknown>).H = { CallEngine, MemoryBus, blankVideoTrack, MAX_CALL_PEOPLE };
