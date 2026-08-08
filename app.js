'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- helpers ---------- */
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 320); }, 3400);
}

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('✅ Saved: ' + filename);
}

function showResult(id, { blob, url, name }) {
  const box = document.getElementById(id);
  box.classList.remove('hidden');
  const audio = box.querySelector('audio');
  if (audio.dataset.url) URL.revokeObjectURL(audio.dataset.url);
  audio.src = blob ? URL.createObjectURL(blob) : url;
  audio.dataset.url = audio.src;
  box.querySelector('.btn-dl').onclick = () => {
    if (blob) saveBlob(blob, name);
    else {
      fetch(url).then(r => { if (!r.ok) throw 0; return r.blob(); }).then(b => saveBlob(b, name))
        .catch(() => { window.open(url, '_blank'); toast('⚠️ Direct save blocked — opened in new tab, right-click → Save Audio As…', 'error'); });
    }
  };
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResult(id) {
  const box = document.getElementById(id);
  box.classList.add('hidden');
  const audio = box.querySelector('audio');
  audio.pause();
  if (audio.dataset.url) URL.revokeObjectURL(audio.dataset.url);
}
$$('.icon-btn').forEach(b => b.addEventListener('click', () => hideResult(b.dataset.close)));

/* ---------- tabs ---------- */
$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab.dataset.tab));
}));

/* ================= RECORD ================= */
let mediaRecorder = null, recordChunks = [], recordStream = null, recordCtx = null, meterRAF = null, recordTimer = null, recordStart = 0;

$('#recordBtn').addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') { stopRecording(); return; }
  try { recordStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { return toast('❌ Mic blocked — allow microphone access', 'error'); }

  recordChunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  mediaRecorder = new MediaRecorder(recordStream, mime ? { mimeType: mime } : undefined);
  mediaRecorder.ondataavailable = e => { if (e.data.size) recordChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const type = mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(recordChunks, { type });
    recordStream.getTracks().forEach(t => t.stop());
    addRecording(blob);
  };
  mediaRecorder.start();
  $('#recordBtn').classList.add('recording');
  $('#recordHint').textContent = '🔴 Recording… click the button to stop.';
  recordStart = Date.now();
  recordTimer = setInterval(() => {
    const s = Math.floor((Date.now() - recordStart) / 1000);
    $('#recordTimer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 250);
  startMeter(recordStream);
  toast('🎤 Recording started');
});

function stopRecording() {
  mediaRecorder.stop();
  $('#recordBtn').classList.remove('recording');
  $('#recordHint').textContent = '✅ Saved below — you can download it.';
  clearInterval(recordTimer);
  cancelAnimationFrame(meterRAF);
  if (recordCtx) { recordCtx.close(); recordCtx = null; }
  $('#meterFill').style.width = '0%';
}

function startMeter(stream) {
  recordCtx = new AudioContext();
  const src = recordCtx.createMediaStreamSource(stream);
  const an = recordCtx.createAnalyser(); an.fftSize = 256;
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

function addRecording(blob) {
  const url = URL.createObjectURL(blob);
  const rec = { blob, url, name: 'recording_' + Date.now() + '.webm' };
  const li = document.createElement('li');
  li.className = 'recording';
  li.innerHTML = `
    <audio controls src="${url}"></audio>
    <div class="btn-row">
      <button class="btn btn-primary">⬇️ Download</button>
      <button class="btn btn-ghost" disabled title="AI coming soon">🤖 AI Convert (soon)</button>
      <button class="btn btn-ghost">🗑️</button>
    </div>`;
  const [dl, , del] = li.querySelectorAll('button');
  dl.onclick = () => saveBlob(blob, rec.name);
  del.onclick = () => { URL.revokeObjectURL(url); li.remove(); };
  $('#recordings').prepend(li);
}

/* ================= TEXT TO VOICE ================= */
const CAT = { male: 'male', female: 'female', famous: 'famous' };

function updateVoiceList() {
  const cat = $('#voiceCat').value;
  const opts = $('#voiceSelect img, #voiceSelect option').length;
  $('#voiceSelect').querySelectorAll('optgroup').forEach(og => {
    og.hidden = (og.label.includes('Male') && cat !== CAT.male) ||
                (og.label.includes('Female') && cat !== CAT.female) ||
                (og.label.includes('Famous') && cat !== CAT.famous) ||
                (og.label.includes('Famous') && cat === CAT.famous && false);
  });
  $$('#voiceSelect optgroup').forEach(og => {
    const isMale = og.label.includes('Male'), isFemale = og.label.includes('Female'), isFamous = og.label.includes('Famous');
    og.hidden = cat === CAT.male ? !isMale : cat === CAT.female ? !isFemale : !isFamous;
  });
}
$('#voiceCat').addEventListener('change', updateVoiceList);
updateVoiceList();

async function ttsTikTok(text, voice) {
  const r = await fetch('https://tts-toktok.vercel.app/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, output_format: 'base64', text_speaker: voice })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const bytes = Uint8Array.from(atob(j.audio_base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: 'audio/mpeg' });
}

async function ttsPolly(text, voice) {
  const url = 'https://api.streamelements.com/kappa/v2/speech?voice=' + encodeURIComponent(voice) + '&text=' + encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.blob();
}

$('#ttsBtn').addEventListener('click', async () => {
  const text = $('#ttsText').value.trim();
  if (!text) return toast('⚠️ Type some text first', 'error');

  const cat = $('#voiceCat').value;
  const voice = $('#voiceSelect').value;
  $('#ttsAiNote').classList.toggle('hidden', cat !== CAT.famous);

  if (cat === CAT.famous) {
    return toast('🚧 Famous voices come with the AI update — pick a Male or Female voice for now', 'error');
  }
  if (voice === 'en_us_006') { /* AI deep male below */ }

  const btn = $('#ttsBtn');
  btn.disabled = true; const orig = btn.innerHTML;
  btn.innerHTML = 'Generating…';

  try {
    let blob = (cat === CAT.male && voice === 'en_us_006')
      ? await ttsTikTok(text, voice)
      : await ttsPolly(text, voice);
    showResult('ttsResult', { blob, name: 'voice_' + Date.now() + '.mp3' });
    toast('🎧 Voice generated!');
  } catch (e) {
    toast('⚠️ Could not generate: ' + e.message + ' — try a different voice', 'error');
  } finally { btn.disabled = false; btn.innerHTML = orig; }
});

/* ================= UPLOAD ================= */
const dz = $('#dropzone');
dz.addEventListener('click', () => $('#fileInput').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
$('#fileInput').addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
  if (!file.type.startsWith('audio')) return toast('⚠️ That\'s not an audio file', 'error');
  const name = 'upload_' + Date.now() + '.' + (file.name.split('.').pop() || 'mp3');
  showResult('uploadResult', { blob: file, name });
  toast('📂 Loaded — ' + file.name);
}
