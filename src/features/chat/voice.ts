export type VoiceTake = { blob: Blob; seconds: number; ext: string };

const webmMime = () => {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return "";
};

export const canRecordWebm = () => Boolean(webmMime());

export function prepareAudioContext(): AudioContext | null {
  const Ctx = window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  void ctx.resume();
  return ctx;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const targetRate = 16000;
  const ratio = Math.max(1, sampleRate / targetRate);
  const length = Math.max(0, Math.floor(samples.length / ratio));
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += samples[j];
    const value = Math.max(-1, Math.min(1, sum / (end - start)));
    pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const bytes = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i += 1, offset += 2) view.setInt16(offset, pcm[i], true);
  return new Blob([bytes], { type: "audio/wav" });
}

export function openWavRecorder(stream: MediaStream, ctx: AudioContext): { stop: () => Promise<VoiceTake | null> } {
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0.00001;
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    const channel = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(channel.length);
    copy.set(channel);
    chunks.push(copy);
  };
  source.connect(processor);
  processor.connect(sink);
  sink.connect(ctx.destination);
  const rate = ctx.sampleRate || 48000;
  let done = false;
  return {
    stop: async () => {
      if (done) return null;
      done = true;
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
        source.disconnect();
        sink.disconnect();
      } catch {
        /* nodes already torn down */
      }
      stream.getTracks().forEach((track) => track.stop());
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      chunks.forEach((chunk) => {
        merged.set(chunk, offset);
        offset += chunk.length;
      });
      chunks.length = 0;
      const seconds = rate > 0 ? total / rate : 0;
      try {
        await ctx.close();
      } catch {
        /* context already closed */
      }
      if (seconds < 0.35 || total < 1000) return null;
      const blob = encodeWav(merged, rate);
      return blob.size >= 800 ? { blob, seconds, ext: "wav" } : null;
    },
  };
}

export function openMediaRecorder(stream: MediaStream): { stop: () => Promise<VoiceTake | null> } {
  const mime = webmMime() || (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  const mp4 = mime.includes("mp4");
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  if (mp4) recorder.start();
  else recorder.start(200);
  let done = false;
  return {
    stop: () => new Promise((resolve) => {
      const finish = () => {
        if (done) return;
        done = true;
        stream.getTracks().forEach((track) => track.stop());
        const type = mp4 ? "audio/mp4" : "audio/webm";
        const blob = new Blob(chunks, { type });
        resolve(blob.size >= 800 ? { blob, seconds: 0, ext: mp4 ? "m4a" : "webm" } : null);
      };
      recorder.addEventListener("stop", () => window.setTimeout(finish, mp4 ? 280 : 60), { once: true });
      if (recorder.state === "inactive") finish();
      else recorder.stop();
    }),
  };
}
