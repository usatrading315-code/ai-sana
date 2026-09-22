# Sana AI

Sana is an Android AI assistant and study companion. She chats in Hindi, Hinglish, and English, remembers the current conversation, and can talk through the phone’s microphone and a female device voice.

The AI key never ships in the app. The phone talks to this server. The server talks to the provider.

```
Android UI  →  assistant client  →  Sana server  →  AI provider
```

## What you can do

- Chat, with timestamps, copy, share, regenerate, stop, and retry
- New chat (new conversation id — old context is not mixed in)
- Voice: mic → speech to text → Sana → female text-to-speech, with interrupt, replay, and a voice on/off setting
- Study mode: simple / normal / detailed, step-by-step, notes, quiz, flashcards, timetable, photographed questions
- Work assistant: code, debug, writing, planning, research, documents
- Attach images and documents. Unsupported files get a real error, not a fake reading
- Web search when you turn Web on, or when a question needs current information. Results are labeled. Missing results are not invented
- Memory only when you ask Sana to remember. View, edit, clear. Secrets are refused
- Dark mode, light mode, settings, and a first-run introduction

## Configure the server

Do not edit source code. Copy the example and set secrets on the server only:

```bash
cp .env.example .env
```

Gemini is the intended setup. The key stays in this file, on the server only. `GEMINI_API_KEY` alone is enough; the server then uses Gemini and does not need the key in the app.

```bash
GEMINI_API_KEY=your_gemini_api_key
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
AI_MODEL=gemini-3.8-flash
AI_PROVIDER=gemini
```

`AI_API_KEY` still works as an alias if `GEMINI_API_KEY` is empty. The local demo provider remains available only when you explicitly set `AI_PROVIDER=mock` and `AI_ALLOW_MOCK=1`. A missing Gemini key is a clear error, not a fake reply.

Other providers:

| Provider | AI_BASE_URL | AI_PROVIDER |
| --- | --- | --- |
| OpenAI-compatible (OpenAI, Groq, OpenRouter, Ollama) | provider `/v1` URL | `auto` or `openai` |
| Anthropic | `https://api.anthropic.com` | `anthropic` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini` |

`gemini-3.8-flash` is the current stable Gemini model for chat, study help, and photos. If `AI_MODEL` is left empty and the provider is Gemini, the server uses that model. Do not use `gemini-2.0-flash` or `gemini-pro`; those names are no longer the current API models.

Optional:

- `AI_VISION_MODEL` — vision model used only when a photo is attached
- `AI_VISION=off` — refuse images instead of sending them
- `SEARCH_API_KEY` and `SEARCH_PROVIDER=tavily` or `serper` — richer web search
- Without a search key, Sana tries DuckDuckGo HTML, then the DuckDuckGo instant-answer API, and still refuses to invent links

Docker-style file secret: `GEMINI_API_KEY_FILE=/run/secrets/gemini_api_key`

## Run

```bash
npm install
npm start
```

The server listens on `0.0.0.0:8080`. Open it on an Android phone and use **Add to Home screen** for an installed-app feel. The same UI is what the native app loads.

## Deploy to public HTTPS

Render builds the existing `Dockerfile` from `render.yaml`. The server listens on `0.0.0.0` and Render’s `PORT`. Health is `/api/v1/health`. Chat stays on `/api/chat` and `/api/assistant/chat`.

`GEMINI_API_KEY` is not in this repository. Render asks for it in the dashboard. Do not put it in the Android app, and do not paste it into chat.

From a phone:

1. Download `sana-render-upload.zip`.
2. Create a GitHub repository named `sana-ai` on the `main` branch and upload these files. Do not upload `.env`, an APK, or `android/local.properties`.
3. Open https://dashboard.render.com/register and sign in with GitHub.
4. Choose **New → Blueprint**, select that repository, and apply `render.yaml`.
5. When Render asks for `GEMINI_API_KEY`, type the key only in that secret field.
6. Open `https://<your-service>.onrender.com/api/v1/health`. It must say `"ok": true` and must not show the key.
7. Send that `https://` address back here. The release APK is rebuilt only after that URL is checked.

These server variables are already declared for Render:

```bash
GEMINI_API_KEY=set-only-in-the-render-secret-field
AI_PROVIDER=gemini
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
AI_MODEL=gemini-3.8-flash
TRUST_PROXY=1
```

A free Render service sleeps after about 15 minutes. The first request after sleep can take a minute. Saved chats on the free disk do not survive a new deploy.

## Android app

Open `android/` in Android Studio (JDK 17).

1. Let Studio create `local.properties`.
2. Optional: set `backend.url` in `local.properties`. That value is the Sana server address, not the Gemini key.
   - Emulator, debug: `backend.url=http://10.0.2.2:8080`
   - Phone on the same Wi-Fi, debug: `backend.url=http://192.168.x.x:8080`
   - Release: `backend.url=https://your-sana-server.example`
3. Sync web assets if you changed the UI: `npm run sync-android`
4. Run on a phone. Allow the microphone only if you want voice. Denial keeps text chat working.

The native shell handles the Android back button, microphone permission, speech recognition, female TTS selection, sharing, and the file picker. Release builds use HTTPS. Debug builds allow cleartext so you can point at a computer on your network.

## Privacy

- The API key is read from the server environment or `AI_API_KEY_FILE`. It is not in the app, not in logs, and not in error text.
- Persistent memory stores only explicit facts and rejects passwords, keys, and card-like numbers.
- Chats are stored per device id. One device cannot read another device’s conversation id.

## Limits

- Replies need a configured provider. If the key is missing, Sana says so and keeps your message for retry.
- Image understanding needs a vision-capable model. Otherwise you get a clear error.
- Scanned PDFs with no text layer need a photo plus a vision model.
- Spoken voice depends on the voices installed on the phone. Sana prefers a female voice and does not imitate a real person.
- Web answers are only as current as the search tool. If search returns nothing, Sana says that. DuckDuckGo’s HTML page often answers with a bot check; the no-key fallback then uses only links the instant-answer API actually returned.
- A Gemini reply needs `GEMINI_API_KEY` on the server. This repository does not contain a key, and the app will not invent one.
