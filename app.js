/* ================= Voice Lab — app.js (Public HF Space version) ================= */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- toasts ---------- */
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'error' ? 'error' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 320); }, 4000);
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
function setBusy(btn, busy) { btn.disabled = busy; btn.classList.toggle('busy', busy); }
function setStatus(id, on, text) {
  $(id).classList.toggle('hidden', !on);
  if (text) $(id).querySelector('.status-text').textContent = text;
}

function showResult(id, blob, name) {
  const box = $(id);
  box.classList.remove('hidden');
  const audio = box.querySelector('audio');
  if (audio.dataset.url) URL.revokeObjectURL(audio.dataset.url);
  const url = URL.createObjectURL(blob);
  audio.src = url;
  audio.dataset.url = url;
  box.querySelector('.btn-dl').onclick = () => saveBlob(blob, name);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideResult(id) {
  const box = $(id);
  box.classList.add('hidden');
  const a = box.querySelector('audio');
  a.pause();
  if (a.dataset.url) URL.revokeObjectURL(a.dataset.url);
}
$$('.icon-btn').forEach(b => b.addEventListener('click', () => hideResult(b.dataset.close)));

/* ---------- tabs ---------- */
function goTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}
$$('.tab').forEach(tab => tab.addEventListener('click', () => goTab(tab.dataset.tab)));

/* ==========================================================
   PUBLIC HUGGING FACE SPACE (MeanVC2)
   ========================================================== */
const SPACE_ID = "hugging-apps/meanvc2-voice-conversion";

async function getClient() {
  if (!window.GradioClient) throw new Error("Gradio client not loaded. Refresh the page.");
  return await window.GradioClient.connect(SPACE_ID);
}

async function aiConvertVoice(audioBlob) {
  toast("Connecting to free Space… this can take a while", "info");

  const client = await getClient();
  const file = await window.handle_file(audioBlob);

  // Try the most common endpoint names
  let result;
  try {
    result = await client.predict("/predict", { source_audio: file });
  } catch (e1) {
    try {
      result = await client.predict("/convert", { source_audio: file });
    } catch (e2) {
      try {
        result = await client.predict("/voice_conversion", [file]);
      } catch (e3) {
        throw new Error("Could not call the Space. It may be sleeping or the API changed.");
      }
    }
  }

  const output = Array.isArray(result.data) ? result.data[0] : result.data;

  if (typeof output === "string" && (output.startsWith("http") || output.startsWith("data:"))) {
    const res = await fetch(output);
    return await res.blob();
  }
  if (output instanceof Blob) return output;

  throw new Error("Unexpected response from the Space");
}

async function aiTextToVoice(text) {
  throw new Error("This free Space is mainly for voice conversion, not text-to-speech.");
}

/* =====================================================================
   RECORD
   ===================================================================== */
let mediaRecorder = null, recordChunks = [], recordStream = null, recordCtx = null, meterRAF = null, recordTimer = null, recordStart = 0;
let currentRecordedBlob = null;

$('#recordBtn').addEventListener('click', async () => {
  const btn = $('#recordBtn');
  if (mediaRecorder && mediaRecorder.state === 'recording') { stopRecording(); return; }
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return toast('❌ Microphone blocked', 'error');
  }
  recordChunks = [];
  mediaRecorder = new MediaRecorder(recordStream);
  mediaRecorder.ondataavailable = e => { if (e.data.size) recordChunks.push(e.data); };
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
  mediaRecorder.stop();
  $('#recordBtn').classList.remove('recording');
  clearInterval(recordTimer);
  cancelAnimationFrame(meterRAF);
  if (recordCtx) { recordCtx.close(); recordCtx = null; }
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
    let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i];
    $('#meterFill').style.width = (sum / data.length / 255 * 100).toFixed(1) + '%';
    meterRAF = requestAnimationFrame(draw);
  };
  draw();
}

$('#recordConvertBtn').addEventListener('click', async () => {
  if (!currentRecordedBlob) return toast('⚠️ Record something first', 'error');
  const btn = $('#recordConvertBtn');
  setBusy(btn, true);
  setStatus('#recordStatus', true, '🎛️ Converting… please wait (can take 30–90s)');
  try {
    const out = await aiConvertVoice(currentRecordedBlob);
    showResult('recordResult', out, 'converted_' + Date.now() + '.wav');
    toast('🤖 Converted!', 'ok');
  } catch (err) {
    toast('❌ ' + (err.message || 'Conversion failed'), 'error');
  }
  setStatus('#recordStatus', false);
  setBusy(btn, false);
});

/* =====================================================================
   TEXT
   ===================================================================== */
$('#textBtn').addEventListener('click', async () => {
  toast('This free Space does not support good text-to-speech. Use Record or Upload instead.', 'error');
});

/* =====================================================================
   UPLOAD
   ===================================================================== */
const dz = $('#dropzone');
dz.addEventListener('click', () => $('#fileInput').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
$('#fileInput').addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

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
  setStatus('#uploadStatus', true, '🎛️ Converting… please wait');
  try {
    const out = await aiConvertVoice(uploadedBlob);
    showResult('uploadResult', out, 'converted_' + Date.now() + '.wav');
    toast('🤖 Converted!', 'ok');
  } catch (err) {
    toast('❌ ' + (err.message || 'Conversion failed'), 'error');
  }
  setStatus('#uploadStatus', false);
  setBusy(btn, false);
});
