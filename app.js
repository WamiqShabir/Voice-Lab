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
   APPLIO CONNECTION (Hard Way)
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

  // Step 1: Upload the audio
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
  toast("Converting voice… this can take a while", "info");

  // Step 2: Convert
  let result;
  try {
    result = await client.predict("/enforce_terms", {
      terms_accepted: true,
      param_1: 0,
      param_2: 0.75,
      param_3: 1,
      param_4: 0.5,
      param_5: "rmvpe",
      param_6: audioPath,
      param_7: outputPath,
      param_8: "logs\\model.pth",
      param_9: "logs\\model.index",
      param_10: false,
      param_11: false,
      param_12: 1,
      param_13: false,
      param_14: 155.0,
      param_15: false,
      param_16: 0.5,
      param_17: "WAV",
      param_18: "contentvec",
      param_19: null,
      param_20: false,
      param_21: 1.0,
      param_22: 1.0,
      param_23: false,
      param_24: false,
      param_25: false,
      param_26: false,
      param_27: false,
      param_28: false,
      param_29: false,
      param_30: false,
      param_31: false,
      param_32: false,
      param_33: false,
      param_34: 0.5,
      param_35: 0.5,
      param_36: 0.33,
      param_37: 0.4,
      param_38: 1.0,
      param_39: 0.0,
      param_40: 0,
      param_41: -6,
      param_42: 0.05,
      param_43: 0,
      param_44: 25,
      param_45: 1.0,
      param_46: 0.25,
      param_47: 7,
      param_48: 0.0,
      param_49: 0.5,
      param_50: 8,
      param_51: -6,
      param_52: 0,
      param_53: 1,
      param_54: 1.0,
      param_55: 100,
      param_56: 0.5,
      param_57: 0.0,
      param_58: 0.5,
      param_59: "0"
    });
  } catch (e) {
    console.error("Conversion failed:", e);
    throw new Error("Conversion failed. See console for details.");
  }

  const output = Array.isArray(result.data) ? result.data[0] : result.data;

  // Try to get the audio
  if (typeof output === "string" && (output.startsWith("http") || output.startsWith("data:"))) {
    const res = await fetch(output);
    return await res.blob();
  }

  if (typeof output === "string" && output.toLowerCase().includes("audio")) {
    // Try common Gradio file URLs
    const possibleUrls = [
      APPLIO_URL + "/file=" + output,
      APPLIO_URL + "/file/" + output,
      output
    ];
    for (const url of possibleUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 1000) return blob;
        }
      } catch (e) {}
    }
  }

  // If we can't get the file, tell the user to check Applio
  throw new Error("Conversion finished. Please check Applio for the result and download it from there.");
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
