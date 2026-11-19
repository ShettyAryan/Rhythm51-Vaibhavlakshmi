/**
 * A valid MP3 of silence for tests: MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo,
 * with all-zero frame bodies (which decoders play as silence). ~26 ms per frame.
 */
export function silentMp3(seconds = 2): Buffer {
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
  const frameBytes = Math.floor((144 * 128_000) / 44_100); // 417
  const frame = Buffer.alloc(frameBytes);
  header.copy(frame);
  const frames = Math.ceil(seconds / (1152 / 44_100));
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}
