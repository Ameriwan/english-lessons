// On-device speech recognition (OpenAI Whisper "tiny.en", run in the browser by transformers.js).
// Used where the browser's own recogniser doesn't work -- iPhones, and in-app browsers like LINE.
// The model (~40 MB) downloads once and is then cached by the browser.

const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6";
const MODEL = "onnx-community/whisper-tiny.en";

let pipePromise = null;

// onProgress(0..1) while the model downloads.
export function loadWhisper(onProgress) {
  if (!pipePromise) {
    const files = {};
    pipePromise = (async () => {
      const { pipeline, env } = await import(LIB);
      env.allowLocalModels = false;
      return pipeline("automatic-speech-recognition", MODEL, {
        dtype: "q8",
        device: "wasm",
        progress_callback: p => {
          if (p.status !== "progress" || !p.total) return;
          files[p.file] = [p.loaded, p.total];
          const all = Object.values(files);
          onProgress && onProgress(all.reduce((a, f) => a + f[0], 0) / all.reduce((a, f) => a + f[1], 0));
        },
      });
    })();
    pipePromise.catch(() => { pipePromise = null; });
  }
  return pipePromise;
}

// Records from the mic until she stops talking (or maxMs). Resolves with 16 kHz mono
// samples, or null if no speech was heard.
export async function recordSpeech({ maxMs = 6000, onReady } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  const start = performance.now();
  let floor = 0.005, n = 0, speech = false, lastLoud = 0, done = false;

  return new Promise(resolve => {
    const stop = () => {
      if (done) return;
      done = true;
      proc.onaudioprocess = null;
      try { proc.disconnect(); src.disconnect(); } catch { /* ignore */ }
      stream.getTracks().forEach(t => t.stop());
      const rate = ctx.sampleRate;
      ctx.close().catch(() => {});
      resolve(speech ? resample(join(chunks), rate, 16000) : null);
    };
    proc.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / d.length);
      const t = performance.now() - start;
      if (n++ < 3) { floor = Math.min(0.05, Math.max(floor, rms)); return; } // first ~0.25 s = room noise
      if (rms > Math.max(0.015, floor * 2.5)) { speech = true; lastLoud = t; }
      if ((speech && t - lastLoud > 1000) || t > maxMs || (!speech && t > 5000)) stop();
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    onReady && onReady();
  });
}

export async function transcribe(audio) {
  const asr = await loadWhisper();
  const out = await asr(audio);
  // Whisper writes things like "[BLANK_AUDIO]" or "(coughs)" for non-speech
  return String(out.text || "").replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function join(chunks) {
  const out = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function resample(data, from, to) {
  if (from === to) return data;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(data.length / ratio));
  for (let i = 0; i < out.length; i++) { // average each window (cheap low-pass, avoids aliasing)
    const a = Math.floor(i * ratio), b = Math.min(data.length, Math.max(a + 1, Math.floor((i + 1) * ratio)));
    let s = 0;
    for (let j = a; j < b; j++) s += data[j];
    out[i] = s / (b - a);
  }
  return out;
}
