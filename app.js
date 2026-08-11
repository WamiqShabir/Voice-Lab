/* ================= Voice Lab — app.js ================= */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- toasts ---------- */
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'error' ? 'error' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 320); }, 3600);
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

/* ---------- result cards ---------- */
function showResult(id, blob, name, revokeExtras = []) {
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.tab').forEach(tab => tab.addEventListener('click', () => goTab(tab.dataset.tab)));

/* =====================================================================
   AI ENGINE PLACEHOLDERS
   These do NOT do real AI yet. When you're ready, replace the body of
   each one with your own AI call (on your other PC) and the page will
   wire it up automatically. Keep the signature so the rest works.
   ===================================================================== */

/* ==========================================================
   VOICE LAB AI BACKEND
   ========================================================== */

const API_URL = 'https://voice-lab-api.onrender.com';


/* ----------------------------------------------------------
   Audio → authorized target voice
   ---------------------------------------------------------- */

async function aiConvertVoice(audioBlob, targetVoice) {

  const formData = new FormData();

  formData.append(
    'audio',
    audioBlob,
    'voice-input.webm'
  );

  formData.append(
    'target_voice',
    targetVoice
  );

  const response = await fetch(
    `${API_URL}/api/convert`,
    {
      method: 'POST',
      body: formData
    }
  );

  if (!response.ok) {

    let message = 'Voice conversion failed.';

    try {
      const error = await response.json();

      if (error.detail) {
        message = error.detail;
      }

    } catch (_) {}

    throw new Error(message);
  }

  const data = await response.blob();

  return data;
}


/* ----------------------------------------------------------
   Text → authorized target voice
   ---------------------------------------------------------- */

async function aiTextToVoice(text, targetVoice) {

  const response = await fetch(
    `${API_URL}/api/text-to-voice`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        text: text,
        target_voice: targetVoice
      })
    }
  );

  if (!response.ok) {

    let message = 'Text-to-speech failed.';

    try {
      const error = await response.json();

      if (error.detail) {
        message = error.detail;
      }

    } catch (_) {}

    throw new Error(message);
  }

  const data = await response.blob();

  return data;
}

function notConnected() {
  toast('⚠️ AI engine not connected yet — coming soon (we wire it up together later).', 'error');
}

/* =====================================================================
   TAB 1 — RECORD & CONVERT
   ===================================================================== */
let mediaRecorder = null, recordChunks = [], recordStream = null, recordCtx = null, meterRAF = null, recordTimer = null, recordStart = 0;
let currentRecordedBlob = null, currentRecordedName = 'recording.webm';

$('#recordBtn').addEventListener('click', async () => {
  const btn = $('#recordBtn');
  if (mediaRecorder && mediaRecorder.state === 'recording') { stopRecording(); return; }
  try { recordStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { return toast('❌ Microphone blocked — allow mic access in the browser.', 'error'); }
  recordChunks = [];
  mediaRecorder = new MediaRecorder(recordStream);
  mediaRecorder.ondataavailable = e => { if (e.data.size) recordChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    recordStream.getTracks().forEach(t => t.stop());
    currentRecordedBlob = blob;
    currentRecordedName = 'recording_' + Date.now() + '.webm';
    // show what we recorded immediately (downloadable + preview)
    showResult('recordResult', blob, currentRecordedName);
    $('#recordHint').textContent = '✅ Done! Preview below — you can download it or convert it.';
    toast('🎤 Recording saved');
  };
  mediaRecorder.start();
  btn.classList.add('recording');
  $('#recordHint').textContent = '🔴 Recording… press again to stop.';
  recordStart = Date.now();
  recordTimer = setInterval(() => {
    const s = Math.floor((Date.now() - recordStart) / 1000);
    $('#recordTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 250);
  startMeter(recordStream);
  toast('🎤 Recording started…');
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
  if (!currentRecordedBlob) return toast('⚠️ Record something first.', 'error');
  const btn = $('#recordConvertBtn');
  const target = $('#recordTarget').value;
  setBusy(btn, true);
  setStatus('#recordStatus', true, '🎛️ AI is converting your voice…');
  const out = await aiConvertVoice(currentRecordedBlob, target); // ADD AI HERE
  setStatus('#recordStatus', false);
  setBusy(btn, false);
  if (!out) return notConnected();
  showResult('recordResult', out, 'recording_' + Date.now() + '.wav');
  toast('🤖 Voice converted!', 'ok');
});

/* =====================================================================
   TAB 2 — TEXT TO VOICE
   ===================================================================== */
$('#textBtn').addEventListener('click', async () => {
  const text = $('#textInput').value.trim();
  if (!text) return toast('⚠️ Type some text first.', 'error');
  const target = $('#textTarget').value;
  const btn = $('#textBtn');
  setBusy(btn, true);
  setStatus('#textStatus', true, '🎛️ AI is writing your line…');
  const out = await aiTextToVoice(text, target); // ADD AI HERE
  setStatus('#textStatus', false);
  setBusy(btn, false);
  if (!out) return notConnected();
  showResult('textResult', out, 'speech_' + Date.now() + '.mp3');
  toast('✨ Voice generated!', 'ok');
});

/* =====================================================================
   TAB 3 — UPLOAD & CONVERT
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

let uploadedBlob = null, uploadedName = 'upload.mp3';
function handleFile(file) {
  if (!file.type.startsWith('audio')) return toast('⚠️ That\'s not an audio file.', 'error');
  uploadedBlob = file;
  uploadedName = 'upload_' + Date.now() + '.' + (file.name.split('.').pop() || 'mp3');
  showResult('uploadResult', file, uploadedName);   // downloadable right away
  toast('📂 Audio loaded — ' + file.name, 'ok');
}

$('#uploadConvertBtn').addEventListener('click', async () => {
  if (!uploadedBlob) return toast('⚠️ Upload an audio file first.', 'error');
  const btn = $('#uploadConvertBtn');
  const target = $('#uploadTarget').value;
  setBusy(btn, true);
  setStatus('#uploadStatus', true, '🎛️ AI is converting your audio…');
  const out = await aiConvertVoice(uploadedBlob, target); // ADD AI HERE
  setStatus('#uploadStatus', false);
  setBusy(btn, false);
  if (!out) return notConnected();
  showResult('uploadResult', out, 'converted_' + Date.now() + '.wav');
  toast('🤖 Audio converted!', 'ok');
});

/* ---------- Ctrl+Enter to generate text ---------- */
$('#textInput').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); $('#textBtn').click(); }
});
