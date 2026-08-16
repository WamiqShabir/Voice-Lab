/* ================= Voice Lab — Applio Hard Way ================= */
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
  }, 5000);
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
   APPLIO CONNECTION
   ========================================================== */
const APPLIO_URL = "https://309cb6d374db505eb9.gradio.live";

async function getClient() {
  if (!window.GradioClient) {
    throw new Error("Gradio client not loaded. Refresh the page.");
  }
  return await window.GradioClient.connect(APPLIO_URL);
}

async function aiConvertVoice(audioBlob, modelName) {
  toast("Uploading audio to Applio…", "info");

  const client = await getClient();
  const file = await window.handle_file(audioBlob);

  // Step 1: Upload
  let uploadResult;
  try {
    uploadResult = await client.predict("/save_to_wav2", {
      upload_audio: file
    });
  } catch (e) {
    console.error("Upload failed:", e);
    throw new Error("Failed to upload audio to Applio");
  }

  const data = uploadResult.data;
  const audioPath = Array.isArray(data) ? data[0] : data;
  const outputPath = Array.isArray(data) && data[1] ? data[1] : "assets\\audios\\output.wav";

  console.log("Uploaded path:", audioPath);
  toast("Converting voice… please wait", "info");

  // Step 2: Convert using positional arguments
  let result;
  try {
    result = await client.predict("/enforce_terms", [
      true,                    // 0  terms_accepted
      0,                       // 1  pitch
      0.75,                    // 2  index_rate
      1,                       // 3  volume envelope
      0.5,                     // 4  protect
      "rmvpe",                 // 5  f0 method
      audioPath,               // 6  select audio
      outputPath,              // 7  output path
      "logs\\model.pth",       // 8  voice model
      "logs\\model.index",     // 9  index file
      false,                   // 10 split audio
      false,                   // 11 autotune
      1,                       // 12 autotune strength
      false,                   // 13 proposed pitch
      155.0,                   // 14 proposed pitch threshold
      false,                   // 15 clean audio
      0.5,                     // 16 clean strength
      "WAV",                   // 17 export format
      "contentvec",            // 18 embedder
      null,                    // 19 custom embedder
      false,                   // 20 formant shifting
      1.0,                     // 21 quefrency
      1.0,                     // 22 timbre
      false,                   // 23 post-process
      false,                   // 24 reverb
      false,                   // 25 pitch shift
      false,                   // 26 limiter
      false,                   // 27 gain
      false,                   // 28 distortion
      false,                   // 29 chorus
      false,                   // 30 bitcrush
      false,                   // 31 clipping
      false,                   // 32 compressor
      false,                   // 33 delay
      0.5,                     // 34
      0.5,                     // 35
      0.33,                    // 36
      0.4,                     // 37
      1.0,                     // 38
      0.0,                     // 39
      0,                       // 40
      -6,                      // 41
      0.05,                    // 42
      0,                       // 43
      25,                      // 44
      1.0,                     // 45
      0.25,                    // 46
      7,                       // 47
      0.0,                     // 48
      0.5,                     // 49
      8,                       // 50
      -6,                      // 51
      0,                       // 52
      1,                       // 53
      1.0,                     // 54
      100,                     // 55
      0.5,                     // 56
      0.0,                     // 57
      0.5,                     // 58
      "0"                      // 59
    ]);
  } catch (e) {
    console.error("Conversion failed:", e);
    throw new Error("Conversion failed. See console for details.");
  }

  const output = Array.isArray(result.data) ? result.data[0] : result.data;

  if (typeof output === "string" && (output.startsWith("http") || output.startsWith("data:"))) {
    const res = await fetch(output);
    return await res.blob();
  }

  throw new Error("Conversion may have finished. Please check Applio for the output audio.");
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
  const model = $('#recordTarget').value;
  setBusy(btn, true);
  setStatus('recordStatus', true, '🎛️ Working with Applio…');
  try {
    const out = await aiConvertVoice(currentRecordedBlob, model);
    showResult('recordResult', out, 'converted_' + Date.now() + '.wav');
    toast('🤖 Converted!', 'ok');
  } catch (err) {
    toast('❌ ' + (err.message || 'Conversion failed'), 'error');
  }
  setStatus('recordStatus', false);
  setBusy(btn, false);
});

/* =====================================================================
   TEXT TO VOICE (limited)
   ===================================================================== */
$('#textBtn').addEventListener('click', async () => {
  toast('Text-to-Voice is limited. Please use Record or Upload.', 'error');
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
  const model = $('#uploadTarget').value;
  setBusy(btn, true);
  setStatus('uploadStatus', true, '🎛️ Working with Applio…');
  try {
    const out = await aiConvertVoice(uploadedBlob, model);
    showResult('uploadResult', out, 'converted_' + Date.now() + '.wav');
    toast('🤖 Converted!', 'ok');
  } catch (err) {
    toast('❌ ' + (err.message || 'Conversion failed'), 'error');
  }
  setStatus('uploadStatus', false);
  setBusy(btn, false);
});
