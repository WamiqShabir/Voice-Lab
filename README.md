# Voice Lab

GitHub Pages app: text-to-speech in famous voices (Trump, Biden, Obama, Vader, ...),
plus mic recording / audio upload with pitch effects.

## Deploy
1. Create a repo (e.g. `voice-lab`) on GitHub.
2. Upload `index.html`, `style.css`, `app.js`.
3. Repo **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**.
4. Your site is live at `https://<username>.github.io/voice-lab/`.

## How it works
- TTS uses the keyless StreamElements API: `https://api.streamelements.com/kappa/v2/speech?voice=<id>&text=<text>`.
- Recording uses `getUserMedia` + `MediaRecorder`; effects use the Web Audio API.
- If the TTS API is unreachable, it falls back to the browser's built-in `speechSynthesis` voices.

## Limits
- Static hosting can't run neural voice-conversion models. For real voice-to-voice
  cloning, run RVC locally or use a cloud API (ElevenLabs requires consent for
  real-person voices).
- Text is capped at ~500 chars per request (API limit).
