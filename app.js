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
  }, 6000);
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
const APPLIO_URL = "https://478a4158e37bf18cbd.gradio.live";

async function getClient() {
  if (!window.GradioClient) {
    throw new Error("Gradio client not loaded. Refresh the page.");
  }
  return await window.GradioClient.connect(APPLIO_URL);
}

async function aiConvertVoice(audioBlob, modelName) {
  toast("Uploading audio to Applio…", "info");

  const client = await getClient();

  // Give the file a proper name + extension (fixes the "blob" error)
  let fileToSend = audioBlob;
  if (!(audioBlob instanceof File) || !audioBlob.name || audioBlob.name === "blob") {
    const ext = (audioBlob.type || "").includes("webm") ? "webm" :
                (audioBlob.type || "").includes("ogg")  ? "ogg"  :
                (audioBlob.type || "").includes("wav")  ? "wav"  : "webm";
    fileToSend = new File([audioBlob], `recording_${Date.now()}.${ext}`, {
      type: audioBlob.type || "audio/webm"
    });
  }

  const file = await window.handle_file(fileToSend);

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
  let audioPath = Array.isArray(data) ? data[0] : data;
  let outputPath = Array.isArray(data) && data[1] ? data[1] : null;

  if (Array.isArray(audioPath)) audioPath = audioPath[0];
  audioPath = String(audioPath || "");

  if (!outputPath || outputPath === "undefined") {
    outputPath = audioPath.replace(/\.[^/.]+$/, "") + "_output.wav";
  }
  outputPath = String(outputPath);

  console.log("Audio path:", audioPath);
  console.log("Output path:", outputPath);
  toast("Converting… this can take 1–2 minutes", "info");

  // Step 2: Convert
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

  try {
    await client.predict("/enforce_terms", args);
  } catch (e) {
    console.error("Conversion call error (often still succeeds):", e);
  }

  // Step 3: Try to download the converted file
  toast("Trying to get the converted audio…", "info");

  const filename = outputPath.split(/[/\\]/).pop();
  const possibleUrls = [
    `${APPLIO_URL}/file=${outputPath}`,
    `${APPLIO_URL}/file=${outputPath.replace(/\\/g, "/")}`,
    `${APPLIO_URL}/file=assets/audios/${filename}`,
    `${APPLIO_URL}/file=assets\\audios\\${filename}`,
    `${APPLIO_URL}/file=/tmp/gradio/${filename}`,
  ];

  for (const url of possibleUrls) {
    try {
      console.log("Trying:", url);
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 1000) {
          toast("Converted audio ready!", "ok");
          return blob;
        }
      }
    } catch (e) {
      console.log("Fetch failed for", url);
    }
  }

  throw new Error("Conversion finished! File is on your PC in: Applio folder → assets → audios (look for *_output.wav)");
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
    const out = await aiConvertVoice(currentRecordedBlob, "logs\\model.pth");
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
  setBusy(btn, true);
  setStatus('uploadStatus', true, '🎛️ Working with Applio…');
  try {
    const out = await aiConvertVoice(uploadedBlob, "logs\\model.pth");
    showResult('uploadResult', out, 'converted_' + Date.now() + '.wav');
    toast('🤖 Converted!', 'ok');
  } catch (err) {
    toast('❌ ' + (err.message || 'Conversion failed'), 'error');
  }
  setStatus('uploadStatus', false);
  setBusy(btn, false);
});
