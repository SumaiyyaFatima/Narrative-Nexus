import { useState, useEffect, useRef } from "react";

// ── Dynamic API_BASE: reads from localStorage so you only set it once per session
const STORAGE_KEY = "narrative_nexus_api_base";

const TONES = [
  { label: "Dark",      emoji: "🌑", color: "#1a0a2e", accent: "#7c3aed" },
  { label: "Fantasy",   emoji: "✨", color: "#0d1b2a", accent: "#f59e0b" },
  { label: "Hopeful",   emoji: "🌅", color: "#0f172a", accent: "#34d399" },
  { label: "Emotional", emoji: "💧", color: "#0c1445", accent: "#60a5fa" },
  { label: "Sci-Fi",    emoji: "🛸", color: "#050d1a", accent: "#22d3ee" },
  { label: "Mythic",    emoji: "🐉", color: "#1a0a0a", accent: "#f87171" },
];

const EXAMPLE_PROMPTS = [
  "A forgotten kingdom rising from the ashes",
  "The last oracle speaks before the stars go silent",
  "Two moons collide over a dying civilization",
  "A child who dreams the future into existence",
];

// ── Particle background ──────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height= window.innerHeight;
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      dx:(Math.random() - 0.5) * 0.3,
      dy:-Math.random() * 0.4 - 0.1,
      alpha: Math.random() * 0.6 + 0.2,
    }));
    let frame;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,160,255,${p.alpha})`;
        ctx.fill();
        p.x += p.dx; p.y += p.dy; p.alpha -= 0.001;
        if (p.y < 0 || p.alpha <= 0) {
          p.x = Math.random() * canvas.width;
          p.y = canvas.height + 5;
          p.alpha = Math.random() * 0.6 + 0.2;
        }
      }
      frame = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={canvasRef} style={{ position:"fixed", top:0, left:0, pointerEvents:"none", zIndex:0 }} />;
}

// ── Backend URL Setup Panel ──────────────────────────────────────────────────
function BackendSetup({ onSave }) {
  const [url, setUrl] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  async function handleTest() {
    const cleaned = url.trim().replace(/\/$/, "");
    if (!cleaned) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${cleaned}/health`, {
        signal: AbortSignal.timeout(8000),
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const data = await res.json();
      if (data.status === "ok") {
        setTestResult("ok");
        try { localStorage.setItem(STORAGE_KEY, cleaned); } catch {}
        setTimeout(() => onSave(cleaned), 800);
      } else {
        setTestResult("fail");
      }
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ animation:"fadeIn 0.5s ease", maxWidth:"560px", margin:"0 auto" }}>
      <div style={{
        background:"rgba(255,255,255,0.03)",
        border:"1px solid rgba(124,58,237,0.25)",
        borderRadius:"16px", padding:"24px 28px", marginBottom:"24px",
      }}>
        <div style={{
          fontSize:"10px", letterSpacing:"0.3em", color:"#7c3aed",
          textTransform:"uppercase", marginBottom:"14px",
          fontFamily:"'Cinzel', serif",
        }}>
          ✦ One-time setup
        </div>
        <p style={{
          fontFamily:"'EB Garamond', serif", fontSize:"15px",
          lineHeight:1.8, color:"#c8bfe0", margin:"0 0 16px",
        }}>
          Each time you start your Colab notebook, ngrok gives you a new URL.
          Run <strong style={{color:"#e2d4f0"}}>Cell 4</strong> in the notebook,
          copy the <strong style={{color:"#e2d4f0"}}>🌐 Public URL</strong> printed there,
          and paste it below.
        </p>
        <div style={{
          background:"rgba(0,0,0,0.3)", borderRadius:"10px",
          padding:"12px 16px", fontFamily:"monospace", fontSize:"12px",
          color:"#7c3aed", border:"1px solid rgba(124,58,237,0.2)",
        }}>
          Example: https://abc123.ngrok-free.app
        </div>
      </div>

      <div style={{
        background:"rgba(255,255,255,0.03)",
        border:`1px solid ${testResult === "ok" ? "#34d39966" : testResult === "fail" ? "#f8717166" : "rgba(124,58,237,0.3)"}`,
        borderRadius:"14px", padding:"4px", marginBottom:"16px",
        transition:"border-color 0.3s",
        boxShadow: testResult === "ok" ? "0 0 20px #34d39922" : testResult === "fail" ? "0 0 20px #f8717122" : "0 0 40px rgba(124,58,237,0.08)",
      }}>
        <input
          value={url}
          onChange={e => { setUrl(e.target.value); setTestResult(null); }}
          onKeyDown={e => { if (e.key === "Enter") handleTest(); }}
          placeholder="https://your-ngrok-url.ngrok-free.app"
          style={{
            width:"100%", background:"transparent", border:"none",
            padding:"16px 20px", color:"#e2d4f0", fontSize:"15px",
            fontFamily:"'EB Garamond', serif",
          }}
        />
      </div>

      {testResult === "ok" && (
        <div style={{
          textAlign:"center", color:"#34d399", fontFamily:"'EB Garamond', serif",
          fontStyle:"italic", fontSize:"15px", marginBottom:"16px",
          animation:"fadeIn 0.3s ease",
        }}>
          ✓ Connected! Loading app…
        </div>
      )}
      {testResult === "fail" && (
        <div style={{
          textAlign:"center", color:"#f87171", fontFamily:"'EB Garamond', serif",
          fontStyle:"italic", fontSize:"15px", marginBottom:"16px",
          animation:"fadeIn 0.3s ease",
        }}>
          ✗ Could not reach backend. Is the Colab still running?
          <br />
          <span style={{fontSize:"12px", color:"#55476a"}}>
            Double-check Cell 4 is running and the URL is exact.
          </span>
        </div>
      )}

      <div style={{ textAlign:"center" }}>
        <button
          onClick={handleTest}
          disabled={!url.trim() || testing}
          style={{
            padding:"14px 48px",
            background: url.trim() && !testing
              ? "linear-gradient(135deg,#7c3aedcc,#7c3aed88)"
              : "rgba(255,255,255,0.05)",
            border:`1px solid ${url.trim() && !testing ? "#7c3aed" : "rgba(255,255,255,0.1)"}`,
            borderRadius:"50px",
            color: url.trim() && !testing ? "#fff" : "#444",
            fontSize:"12px", fontFamily:"'Cinzel', serif",
            letterSpacing:"0.2em",
            cursor: url.trim() && !testing ? "pointer" : "not-allowed",
            transition:"all 0.3s",
            boxShadow: url.trim() && !testing ? "0 0 30px #7c3aed44" : "none",
          }}
        >
          {testing ? "Testing connection…" : "✦ CONNECT TO BACKEND ✦"}
        </button>
      </div>
    </div>
  );
}

// ── Tone selector ────────────────────────────────────────────────────────────
function ToneSelector({ selected, onSelect }) {
  return (
    <div style={{ display:"flex", gap:"10px", flexWrap:"wrap", justifyContent:"center" }}>
      {TONES.map((t) => (
        <button key={t.label} onClick={() => onSelect(t)} style={{
          padding:"8px 18px", borderRadius:"30px",
          border: selected?.label === t.label ? `2px solid ${t.accent}` : "2px solid rgba(255,255,255,0.1)",
          background: selected?.label === t.label ? `${t.accent}22` : "rgba(255,255,255,0.04)",
          color: selected?.label === t.label ? t.accent : "#aaa",
          cursor:"pointer", fontSize:"13px",
          fontFamily:"'Cinzel', serif", letterSpacing:"0.05em",
          transition:"all 0.2s",
          boxShadow: selected?.label === t.label ? `0 0 12px ${t.accent}55` : "none",
        }}>
          {t.emoji} {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Scene card ───────────────────────────────────────────────────────────────
function SceneCard({ scene, index, accent, visible, apiBase }) {
  const [imgError, setImgError] = useState(false);
  const [imgBlobUrl, setImgBlobUrl] = useState(null);

  // ✅ Fetch images via JS so ngrok-skip-browser-warning header is sent
  useEffect(() => {
    if (!scene.image_url) return;
    fetch(`${apiBase}${scene.image_url}`, {
      headers: { "ngrok-skip-browser-warning": "true" }
    })
      .then(r => { if (!r.ok) throw new Error("img failed"); return r.blob(); })
      .then(blob => setImgBlobUrl(URL.createObjectURL(blob)))
      .catch(() => setImgError(true));
  }, [scene.image_url, apiBase]);

  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(30px)",
      transition: `all 0.6s ease ${index * 0.15}s`,
      background:"rgba(255,255,255,0.03)",
      border:`1px solid ${accent}33`,
      borderRadius:"16px", overflow:"hidden",
      backdropFilter:"blur(10px)", position:"relative",
    }}>
      <div style={{
        position:"absolute", top:0, left:0, width:"100%", height:"3px",
        background:`linear-gradient(90deg, transparent, ${accent}, transparent)`,
      }} />
      <div style={{ width:"100%", aspectRatio:"16/9", background:"rgba(0,0,0,0.3)", overflow:"hidden" }}>
        {imgBlobUrl && !imgError ? (
          <img
            src={imgBlobUrl}
            alt={`Scene ${index + 1}`}
            style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
          />
        ) : imgError ? (
          <div style={{
            width:"100%", height:"100%", display:"flex",
            alignItems:"center", justifyContent:"center",
            color:"#55476a", fontSize:"13px", fontFamily:"'EB Garamond', serif",
            fontStyle:"italic",
          }}>
            Scene {index + 1}
          </div>
        ) : (
          <div style={{
            width:"100%", height:"100%", display:"flex",
            alignItems:"center", justifyContent:"center",
            color:"#55476a", fontSize:"13px", fontFamily:"'EB Garamond', serif",
            fontStyle:"italic",
          }}>
            Loading…
          </div>
        )}
      </div>
      <div style={{ padding:"20px 22px" }}>
        <div style={{
          fontFamily:"'Cinzel', serif", fontSize:"11px",
          letterSpacing:"0.2em", color:accent,
          marginBottom:"8px", textTransform:"uppercase",
          display:"flex", justifyContent:"space-between", alignItems:"center",
        }}>
          <span>Scene {index + 1}</span>
          <span style={{ opacity:0.5, fontSize:"10px" }}>{scene.beat}</span>
        </div>
        <p style={{
          fontFamily:"'EB Garamond', serif", fontSize:"15px",
          lineHeight:1.8, color:"#c8bfe0", margin:0,
        }}>
          {scene.text}
        </p>
        {scene.location && (
          <div style={{
            marginTop:"10px", fontSize:"11px",
            color:`${accent}88`, fontFamily:"'Cinzel', serif",
            letterSpacing:"0.1em",
          }}>
            📍 {scene.location}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main app ─────────────────────────────────────────────────────────────────
export default function NarrativeNexus() {
  const getSavedBase = () => {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
  };

  const [apiBase,       setApiBase]       = useState(getSavedBase);
  const [prompt,        setPrompt]        = useState("");
  const [tone,          setTone]          = useState(TONES[1]);
  const [phase,         setPhase]         = useState(() => getSavedBase() ? "input" : "setup");
  const [progress,      setProgress]      = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [scenesVisible, setScenesVisible] = useState(false);
  const [scenes,        setScenes]        = useState([]);
  const [videoUrl,      setVideoUrl]      = useState(null);
  const [videoBlobUrl,  setVideoBlobUrl]  = useState(null);  // ✅ blob URL for video
  const [videoLoading,  setVideoLoading]  = useState(false); // ✅ loading state
  const [storyText,     setStoryText]     = useState("");
  const [errorMsg,      setErrorMsg]      = useState("");
  const esRef = useRef(null);

  useEffect(() => () => esRef.current?.close(), []);

  // ✅ When videoUrl is set, fetch it as a blob so ngrok header is sent
  useEffect(() => {
    if (!videoUrl) return;
    setVideoLoading(true);
    setVideoBlobUrl(null);
    fetch(videoUrl, {
      headers: { "ngrok-skip-browser-warning": "true" }
    })
      .then(r => {
        if (!r.ok) throw new Error(`Video fetch failed: ${r.status}`);
        return r.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        setVideoBlobUrl(blobUrl);
        setVideoLoading(false);
      })
      .catch(err => {
        console.error("Video fetch error:", err);
        setVideoLoading(false);
      });

    return () => {
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    };
  }, [videoUrl]);

  function handleBackendSaved(url) {
    setApiBase(url);
    setPhase("input");
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;

    setPhase("generating");
    setProgress(0);
    setProgressLabel("Connecting to backend…");
    setScenes([]);
    setVideoUrl(null);
    setVideoBlobUrl(null);
    setStoryText("");
    setErrorMsg("");

    try {
      const res = await fetch(`${apiBase}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ prompt: prompt.trim(), tone: tone.label }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const { job_id } = await res.json();

      const controller = new AbortController();
      esRef.current = { close: () => controller.abort() };

      const sseRes = await fetch(`${apiBase}/status/${job_id}`, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: controller.signal,
      });

      if (!sseRes.ok || !sseRes.body) {
        throw new Error(`SSE connect failed: ${sseRes.status}`);
      }

      const reader = sseRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          let data;
          try { data = JSON.parse(line.slice(5).trim()); } catch { continue; }
          setProgress(data.progress);
          setProgressLabel(data.label);
          if (data.scenes?.length > 0) setScenes(data.scenes);
          if (data.story) setStoryText(data.story);
          if (data.status === "done") {
            controller.abort();
            setVideoUrl(`${apiBase}${data.video_url}`);
            setPhase("result");
            setTimeout(() => setScenesVisible(true), 150);
            return;
          }
          if (data.status === "error") {
            controller.abort();
            setErrorMsg(data.label);
            setPhase("error");
            return;
          }
        }
      }

    } catch (err) {
      setErrorMsg(`Could not reach backend: ${err.message}`);
      setPhase("error");
    }
  }

  function handleReset() {
    esRef.current?.close();
    setPhase("input");
    setProgress(0);
    setPrompt("");
    setScenesVisible(false);
    setScenes([]);
    setVideoUrl(null);
    setVideoBlobUrl(null);
    setStoryText("");
    setErrorMsg("");
  }

  function handleChangeBackend() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setApiBase("");
    setPhase("setup");
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#120a24; }
        textarea:focus, input:focus { outline:none; }
        textarea { resize:none; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#7c3aed55; border-radius:2px; }
        @keyframes shimmer {
          0%   { background-position:-200% center; }
          100% { background-position:200% center; }
        }
        @keyframes pulse-glow {
          0%,100% { opacity:0.6; }
          50%     { opacity:1; }
        }
        @keyframes spin-slow {
          from { transform:rotate(0deg); }
          to   { transform:rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity:0; transform:translateY(-8px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>

      <ParticleCanvas />

      <div style={{
        minHeight:"100vh",
        background:"radial-gradient(ellipse at 20% 50%, #2a1060 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #152850 0%, transparent 60%), #120a24",
        fontFamily:"'Cinzel', serif",
        position:"relative", zIndex:1, padding:"0 16px",
      }}>

        {/* ── Header ── */}
        <div style={{ textAlign:"center", paddingTop:"56px", paddingBottom:"8px" }}>
          <div style={{
            fontSize:"11px", letterSpacing:"0.4em", color:"#7c3aed",
            textTransform:"uppercase", marginBottom:"16px",
            animation:"pulse-glow 3s ease-in-out infinite",
          }}>
            ✦ AI Storytelling System ✦
          </div>
          <h1 style={{
            fontSize:"clamp(36px,6vw,64px)", fontWeight:700,
            letterSpacing:"0.08em",
            background:"linear-gradient(135deg,#e2d4f0 0%,#b08fcc 40%,#7c3aed 70%,#4f2fa4 100%)",
            backgroundSize:"200% auto",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            animation:"shimmer 4s linear infinite", lineHeight:1.1,
          }}>
            NARRATIVE NEXUS
          </h1>
          <p style={{
            fontFamily:"'EB Garamond', serif", fontSize:"16px",
            color:"#8878aa", marginTop:"14px", fontStyle:"italic",
          }}>
            One line. A world entire.
          </p>

          {apiBase && phase !== "setup" && (
            <div style={{
              marginTop:"12px", display:"inline-flex", alignItems:"center",
              gap:"8px", background:"rgba(52,211,153,0.07)",
              border:"1px solid rgba(52,211,153,0.2)", borderRadius:"20px",
              padding:"4px 14px 4px 10px",
            }}>
              <span style={{ width:"7px", height:"7px", borderRadius:"50%", background:"#34d399", display:"inline-block", flexShrink:0 }} />
              <span style={{ fontFamily:"monospace", fontSize:"11px", color:"#34d39988", maxWidth:"220px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {apiBase}
              </span>
              <button onClick={handleChangeBackend} style={{
                background:"none", border:"none", color:"#55476a",
                fontSize:"10px", cursor:"pointer", fontFamily:"'Cinzel', serif",
                letterSpacing:"0.05em", padding:0, marginLeft:"2px",
              }}>
                change
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ textAlign:"center", margin:"28px auto", maxWidth:"300px" }}>
          <div style={{ height:"1px", background:"linear-gradient(90deg, transparent, #7c3aed55, transparent)" }} />
        </div>

        <div style={{ maxWidth:"720px", margin:"0 auto" }}>

          {/* ── SETUP PHASE ── */}
          {phase === "setup" && (
            <BackendSetup onSave={handleBackendSaved} />
          )}

          {/* ── INPUT PHASE ── */}
          {phase === "input" && (
            <div style={{ animation:"fadeIn 0.5s ease" }}>
              <div style={{
                background:"rgba(255,255,255,0.05)",
                border:"1px solid rgba(124,58,237,0.3)",
                borderRadius:"16px", padding:"4px",
                marginBottom:"20px",
                boxShadow:"0 0 40px rgba(124,58,237,0.08)",
              }}>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleGenerate(); }}
                  placeholder="Enter your narrative seed…"
                  rows={3}
                  style={{
                    width:"100%", background:"transparent", border:"none",
                    padding:"20px 22px", color:"#e2d4f0", fontSize:"17px",
                    fontFamily:"'EB Garamond', serif", lineHeight:1.6,
                  }}
                />
              </div>

              <div style={{ marginBottom:"28px" }}>
                <div style={{ fontSize:"10px", letterSpacing:"0.3em", color:"#55476a", textAlign:"center", marginBottom:"12px" }}>
                  OR CHOOSE AN EXAMPLE
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", justifyContent:"center" }}>
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button key={p} onClick={() => setPrompt(p)} style={{
                      background:"rgba(255,255,255,0.03)",
                      border:"1px solid rgba(255,255,255,0.08)",
                      borderRadius:"8px", padding:"7px 14px",
                      color:"#998bb5", fontSize:"12px",
                      fontFamily:"'EB Garamond', serif",
                      cursor:"pointer", fontStyle:"italic", transition:"all 0.2s",
                    }}
                    onMouseEnter={e => { e.target.style.borderColor="#7c3aed55"; e.target.style.color="#c9b8e0"; }}
                    onMouseLeave={e => { e.target.style.borderColor="rgba(255,255,255,0.08)"; e.target.style.color="#998bb5"; }}
                    >
                      "{p}"
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:"36px" }}>
                <div style={{ fontSize:"10px", letterSpacing:"0.3em", color:"#55476a", textAlign:"center", marginBottom:"14px" }}>
                  SELECT TONE
                </div>
                <ToneSelector selected={tone} onSelect={setTone} />
              </div>

              <div style={{ textAlign:"center" }}>
                <button onClick={handleGenerate} disabled={!prompt.trim()} style={{
                  padding:"16px 52px",
                  background: prompt.trim()
                    ? `linear-gradient(135deg,${tone.accent}cc,${tone.accent}88)`
                    : "rgba(255,255,255,0.05)",
                  border:`1px solid ${prompt.trim() ? tone.accent : "rgba(255,255,255,0.1)"}`,
                  borderRadius:"50px",
                  color: prompt.trim() ? "#fff" : "#444",
                  fontSize:"13px", fontFamily:"'Cinzel', serif",
                  letterSpacing:"0.2em",
                  cursor: prompt.trim() ? "pointer" : "not-allowed",
                  transition:"all 0.3s",
                  boxShadow: prompt.trim() ? `0 0 30px ${tone.accent}44` : "none",
                }}>
                  ✦ WEAVE THE STORY ✦
                </button>
              </div>
            </div>
          )}

          {/* ── GENERATING PHASE ── */}
          {phase === "generating" && (
            <div style={{ textAlign:"center", padding:"60px 20px", animation:"fadeIn 0.4s ease" }}>
              <div style={{ position:"relative", width:"100px", height:"100px", margin:"0 auto 40px" }}>
                <div style={{
                  width:"100px", height:"100px", borderRadius:"50%",
                  border:`2px solid ${tone.accent}22`,
                  borderTop:`2px solid ${tone.accent}`,
                  animation:"spin-slow 1.5s linear infinite", position:"absolute",
                }} />
                <div style={{
                  width:"70px", height:"70px", borderRadius:"50%",
                  border:`2px solid ${tone.accent}11`,
                  borderBottom:`2px solid ${tone.accent}88`,
                  animation:"spin-slow 2.5s linear infinite reverse",
                  position:"absolute", top:"15px", left:"15px",
                }} />
                <div style={{
                  position:"absolute", top:"50%", left:"50%",
                  transform:"translate(-50%,-50%)", fontSize:"26px",
                }}>✦</div>
              </div>
              <div style={{
                fontFamily:"'EB Garamond', serif", fontStyle:"italic",
                fontSize:"16px", color:"#c8bfe0",
                marginBottom:"32px", minHeight:"28px",
              }}>
                {progressLabel || "Starting…"}
              </div>
              <div style={{
                width:"300px", margin:"0 auto", height:"3px",
                background:"rgba(255,255,255,0.06)", borderRadius:"2px", overflow:"hidden",
              }}>
                <div style={{
                  height:"100%", width:`${progress}%`,
                  background:`linear-gradient(90deg,${tone.accent}88,${tone.accent})`,
                  borderRadius:"2px", transition:"width 0.5s ease",
                  boxShadow:`0 0 10px ${tone.accent}`,
                }} />
              </div>
              <div style={{ marginTop:"10px", fontSize:"11px", color:"#55476a", letterSpacing:"0.2em" }}>
                {progress}%
              </div>
            </div>
          )}

          {/* ── RESULT PHASE ── */}
          {phase === "result" && (
            <div style={{ animation:"fadeIn 0.5s ease" }}>
              <div style={{
                textAlign:"center", marginBottom:"32px", padding:"28px",
                background:"rgba(255,255,255,0.02)", borderRadius:"16px",
                border:`1px solid ${tone.accent}22`,
              }}>
                <div style={{ fontSize:"10px", letterSpacing:"0.3em", color:tone.accent, marginBottom:"10px" }}>
                  {tone.emoji} {tone.label.toUpperCase()} NARRATIVE
                </div>
                <h2 style={{
                  fontFamily:"'EB Garamond', serif", fontSize:"22px",
                  fontStyle:"italic", color:"#e2d4f0", fontWeight:400, lineHeight:1.5,
                }}>
                  "{prompt}"
                </h2>
              </div>

              {/* ✅ Video player — uses blob URL so ngrok header is sent */}
              {videoUrl && (
                <div style={{ marginBottom:"32px", borderRadius:"16px", overflow:"hidden", border:`1px solid ${tone.accent}33` }}>
                  <div style={{
                    padding:"12px 16px",
                    background:"rgba(255,255,255,0.02)",
                    borderBottom:`1px solid ${tone.accent}22`,
                    fontSize:"10px", letterSpacing:"0.25em", color:tone.accent,
                  }}>
                    ▶ GENERATED STORY VIDEO
                  </div>
                  {videoLoading ? (
                    <div style={{
                      width:"100%", aspectRatio:"16/9", background:"#000",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      color:"#7c3aed", fontFamily:"'EB Garamond', serif",
                      fontStyle:"italic", fontSize:"15px",
                    }}>
                      Loading video…
                    </div>
                  ) : videoBlobUrl ? (
                    <video
                      src={videoBlobUrl}
                      controls
                      autoPlay
                      style={{ width:"100%", display:"block", background:"#000" }}
                    />
                  ) : (
                    <div style={{
                      width:"100%", aspectRatio:"16/9", background:"#000",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      color:"#f87171", fontFamily:"'EB Garamond', serif",
                      fontStyle:"italic", fontSize:"14px",
                    }}>
                      Video failed to load. Try downloading below.
                    </div>
                  )}
                </div>
              )}

              {scenes.length > 0 && (
                <div style={{ marginBottom:"32px" }}>
                  <div style={{ fontSize:"10px", letterSpacing:"0.25em", color:"#55476a", textAlign:"center", marginBottom:"16px" }}>
                    STORY SCENES
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
                    {scenes.map((scene, i) => (
                      <SceneCard
                        key={i} scene={scene} index={i}
                        accent={tone.accent} visible={scenesVisible} apiBase={apiBase}
                      />
                    ))}
                  </div>
                </div>
              )}

              {storyText && (
                <details style={{
                  marginBottom:"32px", background:"rgba(255,255,255,0.02)",
                  border:`1px solid ${tone.accent}22`, borderRadius:"12px",
                  padding:"16px 20px",
                }}>
                  <summary style={{
                    cursor:"pointer", fontSize:"10px", letterSpacing:"0.25em",
                    color:tone.accent, textTransform:"uppercase",
                  }}>
                    📖 Read Full Story
                  </summary>
                  <p style={{
                    fontFamily:"'EB Garamond', serif", fontSize:"16px",
                    lineHeight:1.9, color:"#c8bfe0", marginTop:"16px",
                    whiteSpace:"pre-wrap",
                  }}>
                    {storyText}
                  </p>
                </details>
              )}

              <div style={{ marginBottom:"32px" }}>
                <div style={{ fontSize:"10px", letterSpacing:"0.25em", color:"#55476a", textAlign:"center", marginBottom:"14px" }}>
                  GENERATED USING
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", justifyContent:"center" }}>
                  {["Groq · LLaMA 3.3-70B", "Qwen 2.5-1.5B", "Dreamshaper-8", "Ken Burns Engine"].map(tag => (
                    <span key={tag} style={{
                      padding:"5px 14px", borderRadius:"20px", fontSize:"11px",
                      background:`${tone.accent}11`, border:`1px solid ${tone.accent}33`,
                      color:tone.accent, letterSpacing:"0.08em",
                    }}>{tag}</span>
                  ))}
                </div>
              </div>

              <div style={{ display:"flex", gap:"12px", justifyContent:"center", flexWrap:"wrap" }}>
                <button onClick={handleReset} style={{
                  padding:"13px 36px",
                  background:`linear-gradient(135deg,${tone.accent}cc,${tone.accent}88)`,
                  border:`1px solid ${tone.accent}`, borderRadius:"50px",
                  color:"#fff", fontSize:"12px", fontFamily:"'Cinzel', serif",
                  letterSpacing:"0.18em", cursor:"pointer",
                  boxShadow:`0 0 24px ${tone.accent}44`,
                }}>
                  ✦ NEW STORY
                </button>
                {videoUrl && (
                  <a href={videoBlobUrl || videoUrl} download="narrative_nexus.mp4" style={{
                    padding:"13px 36px",
                    background:"rgba(255,255,255,0.04)",
                    border:"1px solid rgba(255,255,255,0.12)",
                    borderRadius:"50px", color:"#998bb5",
                    fontSize:"12px", fontFamily:"'Cinzel', serif",
                    letterSpacing:"0.18em", cursor:"pointer",
                    textDecoration:"none", display:"inline-block",
                  }}>
                    ↓ DOWNLOAD VIDEO
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── ERROR PHASE ── */}
          {phase === "error" && (
            <div style={{ textAlign:"center", padding:"60px 20px", animation:"fadeIn 0.4s ease" }}>
              <div style={{ fontSize:"40px", marginBottom:"20px" }}>⚠️</div>
              <div style={{
                fontFamily:"'EB Garamond', serif", fontSize:"16px",
                color:"#f87171", marginBottom:"12px", fontStyle:"italic",
              }}>
                {errorMsg || "Something went wrong."}
              </div>
              <div style={{
                fontSize:"12px", color:"#55476a",
                fontFamily:"'EB Garamond', serif", marginBottom:"32px",
              }}>
                Make sure your Colab notebook is still running and the ngrok URL is correct.
              </div>
              <div style={{ display:"flex", gap:"12px", justifyContent:"center", flexWrap:"wrap" }}>
                <button onClick={handleReset} style={{
                  padding:"13px 36px",
                  background:"rgba(248,113,113,0.15)",
                  border:"1px solid #f8717155", borderRadius:"50px",
                  color:"#f87171", fontSize:"12px", fontFamily:"'Cinzel', serif",
                  letterSpacing:"0.18em", cursor:"pointer",
                }}>
                  ← TRY AGAIN
                </button>
                <button onClick={handleChangeBackend} style={{
                  padding:"13px 36px",
                  background:"rgba(124,58,237,0.1)",
                  border:"1px solid #7c3aed55", borderRadius:"50px",
                  color:"#7c3aed", fontSize:"12px", fontFamily:"'Cinzel', serif",
                  letterSpacing:"0.18em", cursor:"pointer",
                }}>
                  ↺ UPDATE BACKEND URL
                </button>
              </div>
            </div>
          )}

        </div>

        <div style={{
          textAlign:"center", padding:"48px 0 28px",
          fontSize:"10px", letterSpacing:"0.25em", color:"#33284a",
        }}>
          NARRATIVE NEXUS · AI STORYTELLING SYSTEM
        </div>
      </div>
    </>
  );
}
