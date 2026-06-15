"""
NARRATIVE NEXUS — Flask Backend
================================
Run this on Google Colab via Step4_Colab.ipynb
"""

import os, gc, re, cv2, json, math, time, uuid, torch, threading, numpy as np
from gtts import gTTS

# Helps prevent CUDA memory fragmentation on T4
os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"
from pathlib import Path
from PIL import Image
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForCausalLM
from diffusers import StableDiffusionPipeline
from moviepy.editor import VideoFileClip, concatenate_videoclips, AudioFileClip

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}},
     allow_headers=["Content-Type", "ngrok-skip-browser-warning"],
     methods=["GET", "POST", "OPTIONS"])

@app.after_request
def after_request(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, ngrok-skip-browser-warning"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

BASE_DIR = Path("outputs")
BASE_DIR.mkdir(exist_ok=True)

DEMO_FOLDER = "/content/demo"
JOBS = {}

# ── Tone → Genre ──────────────────────────────────────────────────────────────
TONE_TO_GENRE = {
    "Dark":      "Mystery",
    "Fantasy":   "Fantasy",
    "Hopeful":   "Adventure",
    "Emotional": "Romance",
    "Sci-Fi":    "Sci-Fi",
    "Mythic":    "Fantasy",
}

# ── Style maps ────────────────────────────────────────────────────────────────
GENRE_STYLE_MAP = {
    "Fantasy":   "fantasy illustration, painterly, warm volumetric light",
    "Sci-Fi":    "sci-fi illustration, cool blue tones, detailed environment",
    "Adventure": "adventure illustration, golden hour, dynamic composition",
    "Mystery":   "noir illustration, deep shadows, candlelight atmosphere",
    "Horror":    "dark gothic illustration, pale moonlight, eerie fog",
    "Fairy Tale":"fairy tale illustration, soft watercolor, whimsical details",
    "Romance":   "romantic illustration, warm golden light, soft painterly",
}
BASE_STYLE = "storybook illustration, digital painting, highly detailed, cinematic"

NEGATIVE_PROMPT = (
    "ugly, blurry, low quality, distorted, bad anatomy, bad hands, "
    "watermark, text, signature, realistic photo, 3d render, "
    "plain background, solid color background, floating in void"
)

BEAT_DESCRIPTIONS = {
    "OPENING":       "establishing shot, introduce world and character, calm curiosity",
    "RISING_ACTION": "character moves with purpose, sense of journey beginning",
    "MIDPOINT":      "something discovered, pivot moment, mid-action",
    "CLIMAX":        "most dramatic moment, high tension, peak action",
    "RESOLUTION":    "aftermath, emotional payoff, calm after storm",
}

EFFECTS_CYCLE     = ["zoom_in","pan_right","zoom_out","pan_left","zoom_in",
                      "pan_right","zoom_out","pan_left","zoom_in","pan_right"]
FIXED_SEED        = 42
SECONDS_PER_SCENE = 5
NUM_SCENES        = 6


# ═══════════════════════════════════════════════════════════════════════════════
# DEMO FOLDER HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def find_demo(prompt: str):
    """
    Scans /content/demo/ for files matching the prompt exactly
    (case-insensitive, whitespace-trimmed).

    Expected files per demo entry:
      <prompt>.txt        — story text
      <prompt>.mp4        — final video
      <prompt>_s0.png ... <prompt>_s7.png  (optional scene images)
    """
    if not os.path.isdir(DEMO_FOLDER):
        print(f"[DEMO] ⚠️  Demo folder not found: {DEMO_FOLDER}")
        return None

    key = prompt.strip().lower()

    for filename in os.listdir(DEMO_FOLDER):
        if not filename.endswith(".txt"):
            continue

        file_key = filename[:-4].strip().lower()
        if file_key != key:
            continue

        base        = os.path.join(DEMO_FOLDER, filename[:-4])
        txt_path    = f"{base}.txt"
        video_path  = f"{base}.mp4"
        image_paths = [f"{base}_s{i}.png" for i in range(8)
                       if os.path.exists(f"{base}_s{i}.png")]

        if not os.path.exists(video_path):
            print(f"[DEMO] ⚠️  .txt found but no .mp4 for: '{prompt}'")
            return None

        with open(txt_path, "r") as f:
            story = f.read().strip()

        size_mb = os.path.getsize(video_path) / 1024 / 1024
        print(f"[DEMO] ✅ Hit for: '{prompt}' — video: {size_mb:.1f}MB, {len(image_paths)} scene images")
        return {
            "story":       story,
            "video_path":  video_path,
            "image_paths": image_paths,
        }

    print(f"[DEMO] ℹ️  No demo match for: '{prompt}'")
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_beat_label(i, total):
    r = i / max(total - 1, 1)
    if r < 0.15:   return "OPENING"
    elif r < 0.40: return "RISING_ACTION"
    elif r < 0.60: return "MIDPOINT"
    elif r < 0.85: return "CLIMAX"
    else:          return "RESOLUTION"


def split_into_scenes(text, n):
    sents = re.split(r'(?<=[.!?])\s+', text.strip())
    sents = [s.strip() for s in sents if len(s.strip()) > 15]
    clean = [sents[0]]
    for s in sents[1:]:
        if s.lower() != clean[-1].lower():
            clean.append(s)
    sz     = max(1, len(clean) // n)
    chunks = []
    for i in range(n):
        start = i * sz
        end   = start + sz if i < n - 1 else len(clean)
        c     = " ".join(clean[start:end])
        if c.strip(): chunks.append(c)
    while len(chunks) < n:
        chunks.append(chunks[-1])
    return chunks


def build_prompt(scene_p, char_lock, genre_style, base_style):
    char_lock = " ".join(char_lock.split()[:10])
    scene_p   = " ".join(scene_p.split()[:16])
    full      = f"{char_lock}, {scene_p}, {genre_style}, {base_style}"
    return " ".join(full.split()[:55])


def apply_ken_burns(img_path, out_path, duration, effect):
    img = cv2.imread(str(img_path))
    h, w = img.shape[:2]
    fps, frames = 24, int(duration * 24)
    out = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for idx in range(frames):
        t = idx / frames
        if   effect == "zoom_in":   scale=1+0.12*t;    cx,cy=w//2,h//2
        elif effect == "zoom_out":  scale=1.12-0.12*t; cx,cy=w//2,h//2
        elif effect == "pan_right": scale=1.1; cx=int(w*(0.45+0.1*t)); cy=h//2
        elif effect == "pan_left":  scale=1.1; cx=int(w*(0.55-0.1*t)); cy=h//2
        else:                       scale=1;   cx,cy=w//2,h//2
        nw,nh = int(w/scale),int(h/scale)
        x1=max(0,cx-nw//2); y1=max(0,cy-nh//2)
        x2=min(w,x1+nw);    y2=min(h,y1+nh)
        out.write(cv2.resize(img[y1:y2,x1:x2],(w,h),interpolation=cv2.INTER_LINEAR))
    out.release()


def build_subtitle_chunks(story: str, total_duration: float, max_chars: int = 58):
    """
    Splits story text into subtitle chunks timed evenly across total_duration.
    Returns list of (start_sec, end_sec, text) tuples.
    """
    sentences = re.split(r'(?<=[.!?])\s+', story.strip())
    sentences = [s.strip() for s in sentences if len(s.strip()) > 5]

    chunks  = []
    current = ""
    for sent in sentences:
        for word in sent.split():
            test = (current + " " + word).strip()
            if len(test) <= max_chars:
                current = test
            else:
                if current:
                    chunks.append(current)
                current = word
    if current:
        chunks.append(current)

    if not chunks:
        return []

    dur_each = total_duration / len(chunks)
    return [(i * dur_each, (i + 1) * dur_each, chunk)
            for i, chunk in enumerate(chunks)]


def burn_subtitles_opencv(input_path: str, output_path: str, subtitle_chunks: list):
    """
    Burns subtitles onto every frame of the video using OpenCV.
    - Semi-transparent dark bar at the bottom
    - White text with black outline for readability on any background
    subtitle_chunks: list of (start_sec, end_sec, text)
    """
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    tmp_path = str(output_path) + ".raw.mp4"
    out = cv2.VideoWriter(tmp_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

    font       = cv2.FONT_HERSHEY_DUPLEX
    font_scale = 0.65
    thickness  = 1
    bar_h      = 52          # height of the dark subtitle bar
    padding    = 10          # pixels from bottom of bar

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        current_sec = frame_idx / fps

        # Find the subtitle chunk that covers this timestamp
        text = ""
        for (start, end, chunk) in subtitle_chunks:
            if start <= current_sec < end:
                text = chunk
                break

        if text:
            # Draw semi-transparent dark bar
            overlay = frame.copy()
            cv2.rectangle(overlay, (0, h - bar_h), (w, h), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

            # Measure text to centre it
            (tw, th), _ = cv2.getTextSize(text, font, font_scale, thickness)
            tx = max(8, (w - tw) // 2)
            ty = h - padding

            # Black outline (draw text shifted in 4 directions)
            for dx, dy in [(-2,0),(2,0),(0,-2),(0,2)]:
                cv2.putText(frame, text, (tx+dx, ty+dy), font,
                            font_scale, (0, 0, 0), thickness + 1, cv2.LINE_AA)
            # White text on top
            cv2.putText(frame, text, (tx, ty), font,
                        font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

        out.write(frame)
        frame_idx += 1

    cap.release()
    out.release()

    # Re-mux with ffmpeg to fix container (OpenCV mp4v needs this)
    os.system(f'ffmpeg -y -i "{tmp_path}" -c copy "{output_path}" -loglevel error')
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    print(f"[subtitles] ✅ Burned {len(subtitle_chunks)} chunks onto {frame_idx} frames")


def generate_story_groq(prompt, tone, genre):
    key = os.environ.get("GROQ_API_KEY", "")
    if key:
        try:
            from groq import Groq
            c    = Groq(api_key=key)
            resp = c.chat.completions.create(
                messages=[{"role":"user","content":(
                    f"Write a {genre} story with a single main character and vivid physical locations.\n"
                    f"Tone: {tone}\nPremise: {prompt}\n\n"
                    f"Rules: 400-600 words. Describe at least 5 distinct locations. "
                    f"Every paragraph must have a physical action. Keep it visual and grounded."
                )}],
                model="llama-3.3-70b-versatile",
                max_tokens=800, temperature=0.85
            )
            return resp.choices[0].message.content
        except Exception as e:
            print(f"Groq failed: {e} — using fallback story")

    return (
        f"In a realm shaped by {prompt}, a young wanderer left her village at dawn. "
        f"The cobblestone path wound past the old mill and down to the river crossing. "
        f"She hoisted her pack and stepped into the morning mist.\n\n"
        f"By midday she had reached the edge of the ancient forest. Towering oaks formed "
        f"a cathedral of shadow and light. She pressed forward along the mossy trail, "
        f"her hand resting on the worn leather journal at her side.\n\n"
        f"The ruined watchtower appeared at the forest's heart. She climbed the crumbling "
        f"stairs to the top, spread her map across a broken parapet, and traced the route "
        f"ahead with her finger. The mountains were closer than she'd hoped.\n\n"
        f"She descended at dusk and made camp beside a whispering stream. Fireflies drifted "
        f"above the water. She wrote in her journal by the light of a small fire, "
        f"recording everything she'd seen and everything still ahead.\n\n"
        f"At midnight she reached the stone gate of the valley settlement. Warm lantern-light "
        f"spilled from doorways. She knocked on the inn door, and when it opened, "
        f"she stepped inside — tired, dusty, and absolutely alive."
    )


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

def run_pipeline(job_id, user_prompt, tone):
    job    = JOBS[job_id]
    device = "cuda" if torch.cuda.is_available() else "cpu"
    genre  = TONE_TO_GENRE.get(tone, "Fantasy")
    gstyle = GENRE_STYLE_MAP.get(genre, BASE_STYLE)
    jdir   = BASE_DIR / job_id
    jdir.mkdir(exist_ok=True)

    def upd(label, pct):
        job["label"]    = label
        job["progress"] = pct
        print(f"[{job_id[:6]}] {pct}% {label}")

    try:
        upd("Generating your story…", 5)
        story = generate_story_groq(user_prompt, tone, genre)
        job["story"] = story
        upd("Story ready!", 14)

        upd("Loading language model…", 16)
        gc.collect()
        torch.cuda.empty_cache()
        torch.cuda.synchronize()

        QWEN_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
        qtok = AutoTokenizer.from_pretrained(QWEN_MODEL)
        qmdl = AutoModelForCausalLM.from_pretrained(
            QWEN_MODEL, device_map="auto", torch_dtype=torch.float16,
        )
        qmdl.eval()

        def qask(p, n=60):
            inp = qtok(p, return_tensors="pt").to(device)
            with torch.no_grad():
                out = qmdl.generate(**inp, max_new_tokens=n, temperature=0.3,
                                    do_sample=False, pad_token_id=qtok.eos_token_id)
            return qtok.decode(out[0], skip_special_tokens=True).replace(p,"").strip().split("\n")[0].strip()

        upd("Locking character appearance…", 22)
        char_lock = qask(
            "Read this story. Describe the main character using ONLY visual attributes.\n"
            "Format: [age] [gender], [hair color+style], [eye color], [skin tone], [clothing]\n"
            "MAX 12 words. NO names. NO verbs. Comma-separated only.\n"
            "Example: young girl, long wavy auburn hair, green eyes, fair skin, brown vest\n"
            f"Story: {story[:600]}\nCharacter visual tokens:", 25
        )
        job["character_lock"] = char_lock

        upd("Mapping story locations…", 27)
        raw  = qask(
            f"List exactly {NUM_SCENES} distinct physical locations in this story.\n"
            f"One per line, 3-5 words each, specific and visual.\n"
            f"Story: {story[:800]}\nLocations:", NUM_SCENES * 12
        )
        locs = [re.sub(r'^[\d\-\.\*]+\s*','',l).strip() for l in raw.split("\n") if l.strip()]
        locs = [l for l in locs if len(l) > 3]
        fb   = ["village square","forest path","stone tower","riverside bank","mountain pass","ancient ruins"]
        while len(locs) < NUM_SCENES: locs.append(fb[len(locs) % len(fb)])
        locs = locs[:NUM_SCENES]

        upd("Splitting story into scenes…", 32)
        scenes_text = split_into_scenes(story, NUM_SCENES)
        beats       = [get_beat_label(i, NUM_SCENES) for i in range(NUM_SCENES)]

        upd("Writing scene prompts…", 36)
        scene_prompts = []
        for i in range(NUM_SCENES):
            prev = ""
            if scene_prompts:
                prev = "ALREADY USED (don't reuse location/object/action):\n"
                prev += "\n".join([f"  {j+1}: {p}" for j,p in enumerate(scene_prompts)]) + "\n\n"
            sp = qask(
                f"Image prompt #{i+1}/{NUM_SCENES} for a {genre} storybook.\n"
                f"BEAT: {beats[i]} — {BEAT_DESCRIPTIONS[beats[i]]}\n"
                f"LOCATION: {locs[i]}\nSCENE: {scenes_text[i][:350]}\n\n"
                f"{prev}"
                f"Write ONE SD prompt (max 15 words).\n"
                f"MUST have: (1) shot type (2) the location (3) one specific action.\n"
                f"BANNED: standing, looking, gazing, beautiful, magical, wonderful\n"
                f"Scene {i+1} prompt:", 28
            )
            scene_prompts.append(sp)
            upd(f"Writing scene prompts… ({i+1}/{NUM_SCENES})", 36 + i)

        upd("Freeing language model…", 43)
        del qmdl, qtok
        gc.collect()
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        import time as _t; _t.sleep(2)

        upd("Loading image model…", 45)
        pipe = StableDiffusionPipeline.from_pretrained(
            "Lykon/dreamshaper-8", torch_dtype=torch.float16, safety_checker=None
        ).to(device)
        pipe.enable_attention_slicing(1)
        pipe.enable_vae_slicing()

        img_paths  = []
        scene_data = []
        for i in range(NUM_SCENES):
            pct = 48 + int(i / NUM_SCENES * 30)
            upd(f"Generating scene {i+1} of {NUM_SCENES}…", pct)
            fp  = build_prompt(scene_prompts[i], char_lock, gstyle, BASE_STYLE)
            gen = torch.Generator(device=device).manual_seed(FIXED_SEED + i)
            img = pipe(prompt=fp, negative_prompt=NEGATIVE_PROMPT,
                       num_inference_steps=30, guidance_scale=7.5,
                       width=512, height=512, generator=gen).images[0]
            img = img.resize((768, 432), Image.LANCZOS)
            p   = jdir / f"scene_{i:02d}.png"
            img.save(p); img_paths.append(p)
            torch.cuda.empty_cache()
            scene_data.append({
                "index": i, "beat": beats[i], "location": locs[i],
                "text": scenes_text[i][:200],
                "image_url": f"/image/{job_id}/{i}"
            })
            job["scenes"] = scene_data

        del pipe; gc.collect(); torch.cuda.empty_cache()

        upd("Generating narration audio…", 78)
        audio_path = None
        seconds_per_scene = SECONDS_PER_SCENE
        try:
            tts = gTTS(text=story, lang="en", slow=False)
            audio_path = jdir / "narration.mp3"
            tts.save(str(audio_path))
            audio_clip = AudioFileClip(str(audio_path))
            audio_duration = audio_clip.duration
            audio_clip.close()
            seconds_per_scene = audio_duration / len(img_paths)
            print(f"[{job_id[:6]}] 🎙 Narration: {audio_duration:.1f}s → {seconds_per_scene:.1f}s/scene")
        except Exception as e:
            print(f"[{job_id[:6]}] ⚠️  gTTS failed ({e}), continuing without audio")
            audio_path = None

        upd("Applying cinematic effects…", 82)
        cdir = jdir / "clips"; cdir.mkdir(exist_ok=True)
        clip_paths = []
        for i, ip in enumerate(img_paths):
            cp = cdir / f"clip_{i:02d}.mp4"
            apply_ken_burns(ip, cp, seconds_per_scene, EFFECTS_CYCLE[i % len(EFFECTS_CYCLE)])
            clip_paths.append(cp)

        upd("Assembling final video…", 90)
        clips = [VideoFileClip(str(p)) for p in clip_paths]
        final = concatenate_videoclips(clips, method="compose")
        if audio_path and Path(audio_path).exists():
            narration = AudioFileClip(str(audio_path))
            # ✅ Trim safely to avoid boundary IOError
            safe_duration = min(narration.duration, final.duration) - 0.1
            narration = narration.subclip(0, safe_duration)
            final = final.set_audio(narration)
            print(f"[{job_id[:6]}] ✅ Narration synced to video")
        # Write video without subtitles first
        raw_vpath = jdir / "output_raw.mp4"
        final.write_videofile(str(raw_vpath), fps=24, codec="libx264",
                              audio_codec="aac", verbose=False, logger=None)
        for c in clips: c.close()

        # ── Burn subtitles ────────────────────────────────────────────────────
        upd("Burning subtitles…", 95)
        vpath = jdir / "output.mp4"
        try:
            video_duration = final.duration
            subtitle_chunks = build_subtitle_chunks(story, video_duration)
            burn_subtitles_opencv(str(raw_vpath), str(vpath), subtitle_chunks)
            print(f"[{job_id[:6]}] ✅ Subtitles burned onto video")
        except Exception as sub_err:
            # If subtitles fail, fall back to the raw video — don't crash the job
            import shutil
            shutil.copy2(str(raw_vpath), str(vpath))
            print(f"[{job_id[:6]}] ⚠️  Subtitle burn failed ({sub_err}), using video without subtitles")

        job["video_path"] = str(vpath)
        job["video_url"]  = f"/video/{job_id}"
        job["status"]     = "done"
        upd("Your story is ready!", 100)

    except Exception as e:
        import traceback
        job["status"] = "error"
        job["error"]  = str(e)
        job["label"]  = f"Error: {str(e)[:120]}"
        print(traceback.format_exc())


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/generate", methods=["OPTIONS"])
@app.route("/health",   methods=["OPTIONS"])
def handle_preflight():
    return "", 204


@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "gpu": torch.cuda.is_available(),
        "demo_folder": os.path.isdir(DEMO_FOLDER),
        "demo_files": os.listdir(DEMO_FOLDER) if os.path.isdir(DEMO_FOLDER) else [],
    })


@app.route("/generate", methods=["POST"])
def generate():
    data   = request.get_json() or {}
    prompt = data.get("prompt", "").strip()
    tone   = data.get("tone", "Fantasy")

    if not prompt:
        return jsonify({"error": "prompt required"}), 400

    demo = find_demo(prompt)
    if demo:
        jid = str(uuid.uuid4())
        JOBS[jid] = {
            "status":         "done",
            "progress":       100,
            "label":          "Loaded from demo library",
            "error":          None,
            "story":          demo["story"],
            "character_lock": "",
            "scenes": [
                {
                    "index":     i,
                    "beat":      "DEMO",
                    "location":  "",
                    "text":      "",
                    "image_url": f"/demo_image/{i}?prompt={prompt}"
                }
                for i in range(len(demo["image_paths"]))
            ],
            "video_path": demo["video_path"],
            "video_url":  f"/video/{jid}",
        }
        print(f"[DEMO] Serving cached demo for: '{prompt}'")
        return jsonify({"job_id": jid})

    jid = str(uuid.uuid4())
    JOBS[jid] = {
        "status": "running", "progress": 0, "label": "Starting…",
        "error": None, "story": "", "scenes": [],
        "video_path": None, "video_url": None, "character_lock": "",
    }
    threading.Thread(target=run_pipeline, args=(jid, prompt, tone), daemon=True).start()
    return jsonify({"job_id": jid})


@app.route("/status/<jid>")
def status(jid):
    if jid not in JOBS:
        return jsonify({"error": "not found"}), 404
    def stream():
        last = -1
        while True:
            j   = JOBS.get(jid, {})
            pct = j.get("progress", 0)
            if pct != last:
                yield f"data: {json.dumps({'progress':pct,'label':j.get('label',''),'status':j.get('status','running'),'scenes':j.get('scenes',[]),'video_url':j.get('video_url'),'story':j.get('story',''),'character':j.get('character_lock','')})}\n\n"
                last = pct
            if j.get("status") in ("done","error"):
                break
            time.sleep(0.5)
    return Response(stream(), mimetype="text/event-stream",
                    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no","Access-Control-Allow-Origin":"*"})


# ✅ FIXED: HTTP range request support for browser video streaming
@app.route("/video/<jid>")
def video(jid):
    j = JOBS.get(jid)
    if not j or not j.get("video_path"):
        return jsonify({"error": "not ready"}), 404

    video_path   = j["video_path"]
    file_size    = os.path.getsize(video_path)
    range_header = request.headers.get("Range", None)

    if not range_header:
        response = Response(
            open(video_path, "rb").read(),
            status=200,
            mimetype="video/mp4",
            headers={
                "Content-Length":              str(file_size),
                "Accept-Ranges":               "bytes",
                "Access-Control-Allow-Origin": "*",
            }
        )
        return response

    byte_start, byte_end = 0, file_size - 1
    match = re.search(r"bytes=(\d+)-(\d*)", range_header)
    if match:
        byte_start = int(match.group(1))
        if match.group(2):
            byte_end = int(match.group(2))

    length = byte_end - byte_start + 1
    with open(video_path, "rb") as f:
        f.seek(byte_start)
        data = f.read(length)

    return Response(
        data, status=206, mimetype="video/mp4",
        headers={
            "Content-Range":               f"bytes {byte_start}-{byte_end}/{file_size}",
            "Accept-Ranges":               "bytes",
            "Content-Length":              str(length),
            "Access-Control-Allow-Origin": "*",
        }
    )


@app.route("/image/<jid>/<int:n>")
def image(jid, n):
    p = BASE_DIR / jid / f"scene_{n:02d}.png"
    if not p.exists():
        return jsonify({"error": "not found"}), 404
    return send_file(str(p), mimetype="image/png")


@app.route("/demo_image/<int:n>")
def demo_image(n):
    prompt = request.args.get("prompt", "")
    if not prompt:
        return jsonify({"error": "prompt required"}), 400
    p = os.path.join(DEMO_FOLDER, f"{prompt}_s{n}.png")
    if not os.path.exists(p):
        return jsonify({"error": "not found"}), 404
    return send_file(p, mimetype="image/png")


if __name__ == "__main__":
    print("🎬 Narrative Nexus Backend")
    print(f"   GPU: {torch.cuda.is_available()}")
    print(f"   Demo folder: {DEMO_FOLDER}")
    print(f"   Demo folder exists: {os.path.isdir(DEMO_FOLDER)}")
    if os.path.isdir(DEMO_FOLDER):
        print(f"   Demo files: {os.listdir(DEMO_FOLDER)}")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
