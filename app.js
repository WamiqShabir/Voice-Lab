/* ================= Voice Lab — Applio (full working version) ================= */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- toasts ---------- */
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'error' ? 'error' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => {
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 320);
  }, 7000);
}

/* ---------- helpers ---------- */
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('✅ Saved: ' + name, 'ok');
}

function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.classList.toggle('busy', busy);
}

function setStatus(id, on, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden', !on);
  if (text) {
    const span = el.querySelector('.status-text');
    if (span) span.textContent = text;
  }
}

function showResult(id, blob, name) {
  const box = document.getElementById(id);
  if (!box) return;
  box.classList.remove('hidden');
  const audio = box.querySelector('audio');
  if (audio.dataset.url) URL.revokeObjectURL(audio.dataset.url);
  const url = URL.createObjectURL(blob);
  audio.src = url;
  audio.dataset.url = url;
  audio.load();
  const dlBtn = box.querySelector('.btn-dl');
  if (dlBtn) dlBtn.onclick = () => saveBlob(blob, name);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResult(id) {
  const box = document.getElementById(id);
  if (!box) return;
  box.classList.add('hidden');
  const a = box.querySelector('audio');
  if (a) {
    a.pause();
    if (a.dataset.url) URL.revokeObjectURL(a.dataset.url);
  }
}

$$('.icon-btn').forEach(b => {
  b.addEventListener('click', () => hideResult(b.dataset.close));
});

/* ---------- tabs ---------- */
function goTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}
$$('.tab').forEach(tab => tab.addEventListener('click', () => goTab(tab.dataset.tab)));

/* ==========================================================
   FORCE any format → WAV
   ========================================================== */
async function forceToWav(blob) {
  if (blob.type && (blob.type.includes('wav') || blob.type.includes('mpeg') || blob.type.includes('mp3'))) {
    return blob;
  }

  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.error("decodeAudioData failed:", e);
    throw new Error("Browser could not decode the recording. Try uploading a WAV/MP3 file instead.");
  }

  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = audioBuffer.getChannelData(ch)[i];
      sample = Math.max(-1, Math.min(1, sample));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  await audioCtx.close();
  return new Blob([buffer], { type: 'audio/wav' });
}

/* ==========================================================
   APPLIO
   ========================================================== */
const APPLIO_URL = "https://478a4158e37bf18cbd.gradio.live"; // ← change if the link changes

async function getClient() {
  if (!window.GradioClient) throw new Error("Gradio client not loaded. Refresh the page.");
  return await window.GradioClient.connect(APPLIO_URL);
}

function flattenUrls(data) {
  const urls = [];
  function walk(obj) {
    if (!obj) return;
    if (typeof obj === "string" && (obj.startsWith("http") || obj.includes("audios") || obj.includes(".wav"))) {
      urls.push(obj);
      if (!obj.startsWith("http")) {
        urls.push(`${APPLIO_URL}/file=${obj}`);
        urls.push(`${APPLIO_URL}/file=${obj.replace(/\\/g, "/")}`);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else if (typeof obj === "object") {
      Object.values(obj).forEach(walk);
    }
  }
  walk(data);
  return urls;
}

async function aiConvertVoice(audioBlob) {
  toast("Converting recording to WAV…", "info");

  let wavBlob;
  try {
    wavBlob = await forceToWav(audioBlob);
  } catch (e) {
    console.error(e);
    throw e;
  }

  const fileToSend = new File([wavBlob], `recording_${Date.now()}.wav`, {
    type: "audio/wav"
  });

  const client = await getClient();
  const file = await window.handle_file(fileToSend);

  // Upload
  toast("Uploading to Applio…", "info");
  let uploadResult;
  try {
    uploadResult = await client.predict("/save_to_wav2", { upload_audio: file });
  } catch (e) {
    console.error(e);
    throw new Error("Failed to upload audio to Applio");
  }

  const data = uploadResult.data;
  let audioPath = Array.isArray(data) ? data[0] : data;
  let outputPath = Array.isArray(data) && data[1] ? data[1] : null;

  if (Array.isArray(audioPath)) audioPath = audioPath[0];
  audioPath = String(audioPath || "");

  if (!outputPath) {
    outputPath = audioPath.replace(/\.[^/.]+$/, "") + "_output.wav";
  }
  outputPath = String(outputPath);

  console.log("Input path:", audioPath);
  console.log("Expected output path:", outputPath);

  toast("Converting with Applio… please wait (1–2 min)", "info");

  const args = [
    true, 0, 0.75, 1.0, 0.5, "rmvpe",
    audioPath, outputPath,
    "logs\\model.pth", "logs\\model.index",
    false, false, 1.0, false, 155, false, 0.5, "WAV", "contentvec", null,
    false, 1.0, 1.0, false,
    false, false, false, false, false, false, false, false, false, false,
    0.5, 0.5, 0.33, 0.4, 1.0, 0.0,
    0, -6, 0.05, 0, 25, 1.0, 0.25, 7, 0.0, 0.5, 8, -6, 0, 1, 1.0, 100, 0.5, 0.0, 0.5, 0
  ];

  let convertResult = null;
  try {
    convertResult = await client.predict("/enforce_terms", args);
    console.log("Convert result:", convertResult);
  } catch (e) {
    console.warn("enforce_terms error (conversion may still succeed):", e);
  }

  // Wait for the file to be written
  await new Promise(r => setTimeout(r, 3000));

  toast("Fetching converted audio…", "info");

  const filename = outputPath.split(/[/\\]/).pop();

  const urlsToTry = [
    ...(convertResult && convertResult.data ? flattenUrls(convertResult.data) : []),
    `${APPLIO_URL}/file=${outputPath}`,
    `${APPLIO_URL}/file=${outputPath.replace(/\\/g, "/")}`,
    `${APPLIO_URL}/file=assets/audios/${filename}`,
    `${APPLIO_URL}/file=assets\\audios\\${filename}`,
    `${APPLIO_URL}/file=/tmp/gradio/${filename}`,
    `${APPLIO_URL}/gradio_api/file=${outputPath}`,
    `${APPLIO_URL}/gradio_api/file=${outputPath.replace(/\\/g, "/")}`,
  ];

  for (const url of urlsToTry) {
    if (!url || typeof url !== "string") continue;
    try {
      console.log("Trying to fetch:", url);
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 2000) {
          toast("Converted audio ready!", "ok");
          return blob;
        }
      }
    } catch (e) {
      console.log("Failed:", url);
    }
  }

  throw new Error("Conversion finished on server but the website could not download the file. Check Applio → assets → audios for the *_output.wav file.");
}

/* =====================================================================
   RECORD
   ===================================================================== */
let mediaRecorder = null, recordChunks = [], recordStream = null, recordCtx = null, meterRAF = null, recordTimer = null, recordStart = 0;
let currentRecordedBlob = null;

$('#recordBtn').addEventListener('click', async () => {
  const btn = $('#recordBtn');
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
    return;
  }

  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return toast('❌ Microphone blocked', 'error');
  }

  recordChunks = [];
  mediaRecorder = new MediaRecorder(recordStream);

  mediaRecorder.ondataavailable = e => {
    if (e.data.size) recordChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    recordStream.getTracks().forEach(t => t.stop());
    currentRecordedBlob = blob;
    showResult('recordResult', blob, 'recording.webm');
    $('#recordHint').textContent = '✅ Recording ready — click Convert';
    toast('🎤 Recording saved');
  };

  mediaRecorder.start();
  btn.classList.add('recording');
  $('#recordHint').textContent = '🔴 Recording… press again to stop';
  recordStart = Date.now();
  recordTimer = setInterval(() => {
    const s = Math.floor((Date.now() - recordStart) / 1000);
    $('#recordTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 250);
  startMeter(recordStream);
});

function stopRecording() {
  if (mediaRecorder) mediaRecorder.stop();
  $('#recordBtn').classList.remove('recording');
  clearInterval(recordTimer);
  cancelAnimationFrame(meterRAF);
  if (recordCtx) {
    recordCtx.close();
    recordCtx = null;
  }
  $('#meterFill').style.width = '0%';
}

function startMeter(stream) {
  recordCtx = new AudioContext();
  const src = recordCtx.createMediaStreamSource(stream);
  const an = recordCtx.createAnalyser();
  an.fftSize = 256;
  src.connect(an);
  const data = new Uint8Array(an.frequencyBinCount);
  const draw = () => {
    an.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    $('#meterFill').style.width = (sum / data.length / 255 * 100).toFixed(1) + '%';
    meterRAF = requestAnimationFrame(draw);
  };
  draw();
}

$('#recordConvertBtn').addEventListener('click', async () => {
  if (!currentRecordedBlob) return toast('⚠️ Record something first', 'error');
  const btn = $('#recordConvertBtn');
  setBusy(btn, true);
  setStatus('recordStatus', true, '🎛️ Working with Applio…');
  try {
    const out = await aiConvertVoice(currentRecordedBlob);
    showResult('recordResult', out, 'converted_' + Date.now() + '.wav');
    toast('🤖 Converted!', 'ok');
  } catch (err) {
    toast('❌ ' + (err.message || 'Conversion failed'), 'error');
  }
  setStatus('recordStatus', false);
  setBusy(btn, false);
});

/* =====================================================================
   TEXT
   ===================================================================== */
$('#textBtn').addEventListener('click', async () => {
  toast('Text-to-Voice is limited. Use Record or Upload.', 'error');
});

/* =====================================================================
   UPLOAD
   ===================================================================== */
const dz = $('#dropzone');
dz.addEventListener('click', () => $('#fileInput').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('drag');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
$('#fileInput').addEventListener('change', e => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

let uploadedBlob = null;
function handleFile(file) {
  if (!file.type.startsWith('audio')) return toast('⚠️ Not an audio file', 'error');
  uploadedBlob = file;
  showResult('uploadResult', file, file.name);
  toast('📂 Audio loaded', 'ok');
}

$('#uploadConvertBtn').addEventListener('click', async () => {
  if (!uploadedBlob) return toast('⚠️ Upload an audio file first', 'error');
  const btn = $('#uploadConvertBtn');
  setBusy(btn, true);
  setStatus('uploadStatus', true, '🎛️ Working with Applio…');
  try {
    const out = await aiConvertVoice(uploadedBlob);
    showResult('uploadResult', out, 'converted_' + Date.now() + '.wav');
    toast('🤖 Converted!', 'ok');
  } catch (err) {
    toast('❌ ' + (err.message || 'Conversion failed'), 'error');
  }
  setStatus('uploadStatus', false);
  setBusy(btn, false);
});
