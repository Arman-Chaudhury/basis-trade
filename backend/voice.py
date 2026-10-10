"""ElevenLabs text to speech, cached on disk by hash so a line is paid for once. Ported from Atropos lib/voice.js."""
import hashlib, json, os, time
import httpx
from backend.config import DATA_DIR

DIR = DATA_DIR / "voice"; DIR.mkdir(exist_ok=True)
MODEL = "eleven_flash_v2_5"; MAX_CHARS = 300; PER_HOUR = 40
_made = []


def voice_id():
    if os.getenv("ATTY_VOICE_ID"): return os.getenv("ATTY_VOICE_ID")
    try: return json.loads((DATA_DIR / "atropos" / "voice-jev.json").read_text())["voice_id"]
    except Exception: return "cgSgspJ2msm6clMCkdW9"  # noqa: BLE001


def configured(): return bool(os.getenv("ELEVENLABS_API_KEY"))
def _file(text): return DIR / (hashlib.sha1(text.encode()).hexdigest() + ".mp3")
def spoken(text): return text.replace("−", "minus ").replace("IBKR", "Interactive Brokers").replace("pp", " points")


def speak(text):
    text = (text or "").strip()
    if not text or len(text) > MAX_CHARS: raise ValueError(f"line must be 1 to {MAX_CHARS} characters")
    f = _file(text)
    if f.exists(): return f.read_bytes()
    if not configured(): raise RuntimeError("ELEVENLABS_API_KEY is not set")
    now = time.time(); _made[:] = [t for t in _made if now - t < 3600]
    if len(_made) >= PER_HOUR: raise RuntimeError("voice limit reached for this hour")
    r = httpx.post(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id()}", params={"output_format": "mp3_44100_64"}, timeout=30,
                   headers={"xi-api-key": os.getenv("ELEVENLABS_API_KEY"), "Content-Type": "application/json", "Accept": "audio/mpeg"},
                   json={"text": spoken(text), "model_id": MODEL, "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.2}})
    r.raise_for_status(); _made.append(now); f.write_bytes(r.content); return r.content
