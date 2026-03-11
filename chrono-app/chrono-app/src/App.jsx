import { useState, useEffect, useCallback } from "react";

// ─── Helpers ────────────────────────────────────────────
const genId = () => Math.random().toString(36).substr(2, 9);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromDateKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const isSameDay = (a, b) => toDateKey(a) === toDateKey(b);
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const getWeekStart = (d) => { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; };

const fmt12 = (h, m) => `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
const fmtDur = (mins) => { if (mins < 60) return `${mins}m`; const h = Math.floor(mins / 60), m = mins % 60; return m ? `${h}h ${m}m` : `${h}h`; };
const parseTimeStr = (s) => {
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1]); const mi = parseInt(m[2]); const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h !== 12) h += 12; if (ap === "am" && h === 12) h = 0;
  return { h, m: mi, total: h * 60 + mi };
};

const CATEGORIES = [
  { id: "work", label: "Work", color: "#3B82F6", bg: "#EFF6FF", icon: "💼" },
  { id: "personal", label: "Personal", color: "#8B5CF6", bg: "#F5F3FF", icon: "🏠" },
  { id: "health", label: "Health", color: "#10B981", bg: "#ECFDF5", icon: "💪" },
  { id: "meeting", label: "Meeting", color: "#F59E0B", bg: "#FFFBEB", icon: "👥" },
  { id: "errand", label: "Errand", color: "#EF4444", bg: "#FEF2F2", icon: "🏃" },
  { id: "study", label: "Study", color: "#06B6D4", bg: "#ECFEFF", icon: "📚" },
  { id: "none", label: "None", color: "#9CA3AF", bg: "#F9FAFB", icon: "○" },
];
const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const PRIORITY = { high: { label: "High", color: "#EF4444" }, low: { label: "Low", color: "#9CA3AF" } };

const SAMPLE = `08:00 - Morning standup meeting [meeting]
09:30 - Review pull requests [work]
10:15 - Gym session [health]
12:00 - Lunch break [personal]
13:30 - Client call with Acme Corp [meeting]
14:45 - Write project proposal [work]
16:00 - Pick up groceries [errand]
17:30 - Study React patterns [study]`;

// Storage
const load = async () => { try { const d = localStorage.getItem("chrono-tasks"); return d ? JSON.parse(d) : null; } catch { return null; } };
const save = async (d) => { try { localStorage.setItem("chrono-tasks", JSON.stringify(d)); } catch {} };

export default function App() {
  const [tasks, setTasks] = useState({});
  const [selDate, setSelDate] = useState(new Date());
  const [mode, setMode] = useState("day");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [nw, setNw] = useState({ title: "", time: "", duration: "30", category: "none", priority: "low", recurring: "none" });
  const [clock, setClock] = useState(new Date());
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", time: "", duration: "30", category: "none", priority: "low", recurring: "none" });
  const [filter, setFilter] = useState("all");
  const [catFilt, setCatFilt] = useState("all");
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [mobileSidebar, setMobileSidebar] = useState(false);

  useEffect(() => { load().then((d) => { if (d?.tasks) setTasks(d.tasks); setReady(true); }); }, []);
  useEffect(() => { if (ready) save({ tasks }); }, [tasks, ready]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(t); }, []);

  const dk = toDateKey(selDate);
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const isToday = isSameDay(selDate, new Date());

  const getTasksFor = useCallback((key) => {
    const direct = tasks[key] || [];
    const recurring = [];
    const target = fromDateKey(key);
    Object.entries(tasks).forEach(([k, arr]) => {
      arr.forEach((t) => {
        if (t.recurring === "none" || k === key) return;
        const orig = fromDateKey(k);
        if (target <= orig) return;
        if (direct.some((d) => d.recurParent === t.id)) return;
        let match = false;
        if (t.recurring === "daily") match = true;
        else if (t.recurring === "weekly" && target.getDay() === orig.getDay()) match = true;
        else if (t.recurring === "weekdays" && target.getDay() >= 1 && target.getDay() <= 5) match = true;
        if (match) recurring.push({ ...t, id: `${t.id}_${key}`, isRecurring: true, recurParent: t.id });
      });
    });
    return [...direct, ...recurring].sort((a, b) => a.totalMin - b.totalMin);
  }, [tasks]);

  const dayTasks = getTasksFor(dk);
  const visible = dayTasks.filter((t) => {
    if (filter === "done" && !t.done) return false;
    if (filter === "pending" && t.done) return false;
    if (filter === "upcoming" && (t.totalMin <= nowMin || t.done)) return false;
    if (catFilt !== "all" && t.category !== catFilt) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const addTask = () => {
    if (!nw.title.trim() || !nw.time) return;
    const p = parseTimeStr(nw.time);
    if (!p) return;
    setTasks((prev) => {
      const arr = [...(prev[dk] || []), {
        id: genId(), title: nw.title.trim(), h: p.h, m: p.m, totalMin: p.total,
        duration: parseInt(nw.duration) || 30, done: false, category: nw.category,
        priority: nw.priority, recurring: nw.recurring, createdAt: Date.now(),
      }].sort((a, b) => a.totalMin - b.totalMin);
      return { ...prev, [dk]: arr };
    });
    setNw({ title: "", time: "", duration: "30", category: "none", priority: "low", recurring: "none" });
    setShowAdd(false);
  };

  const toggle = (id) => setTasks((p) => ({ ...p, [dk]: (p[dk] || []).map((t) => t.id === id ? { ...t, done: !t.done } : t) }));
  const del = (id) => setTasks((p) => ({ ...p, [dk]: (p[dk] || []).filter((t) => t.id !== id) }));
  const upd = (id, f, v) => setTasks((p) => ({ ...p, [dk]: (p[dk] || []).map((t) => t.id === id ? { ...t, [f]: v } : t) }));
  const dup = (task, tKey) => setTasks((p) => ({ ...p, [tKey]: [...(p[tKey] || []), { ...task, id: genId(), done: false, isRecurring: false, recurParent: undefined }].sort((a, b) => a.totalMin - b.totalMin) }));

  const startEdit = (task) => {
    setEditId(task.id);
    setEditForm({
      title: task.title,
      time: `${String(task.h).padStart(2, "0")}:${String(task.m).padStart(2, "0")}`,
      duration: String(task.duration),
      category: task.category || "none",
      priority: task.priority || "low",
      recurring: task.recurring || "none",
    });
  };

  const saveEdit = () => {
    if (!editForm.title.trim() || !editForm.time) { setEditId(null); return; }
    const p = parseTimeStr(editForm.time);
    if (!p) { setEditId(null); return; }
    setTasks((prev) => {
      const arr = (prev[dk] || []).map((t) => t.id === editId ? {
        ...t, title: editForm.title.trim(), h: p.h, m: p.m, totalMin: p.total,
        duration: parseInt(editForm.duration) || 30, category: editForm.category,
        priority: editForm.priority, recurring: editForm.recurring,
      } : t).sort((a, b) => a.totalMin - b.totalMin);
      return { ...prev, [dk]: arr };
    });
    setEditId(null);
  };

  const cancelEdit = () => setEditId(null);

  const importData = () => {
    if (!importText.trim()) return;
    const nts = [];
    for (const line of importText.trim().split("\n")) {
      const m = line.match(/^(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[-–—:]\s*(.+)/i);
      if (m) {
        const p = parseTimeStr(m[1]);
        if (p) {
          let title = m[2].trim(), cat = "none";
          const cm = title.match(/\[(\w+)\]\s*$/);
          if (cm && catMap[cm[1]]) { cat = cm[1]; title = title.replace(/\[\w+\]\s*$/, "").trim(); }
          nts.push({ id: genId(), title, h: p.h, m: p.m, totalMin: p.total, duration: 30, done: false, category: cat, priority: "low", recurring: "none", createdAt: Date.now() });
        }
      }
    }
    if (nts.length) {
      setTasks((p) => ({ ...p, [dk]: [...(p[dk] || []), ...nts].sort((a, b) => a.totalMin - b.totalMin) }));
      setImportText(""); setShowImport(false);
    }
  };

  const getStatus = (t) => {
    if (t.done) return "done";
    if (!isToday) return "upcoming";
    const end = t.totalMin + t.duration;
    if (nowMin >= t.totalMin && nowMin < end) return "active";
    if (nowMin >= end) return "overdue";
    return "upcoming";
  };

  const weekStart = getWeekStart(selDate);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const calDays = (() => {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const last = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
    const days = [];
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    for (let i = 1; i <= last.getDate(); i++) days.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), i));
    return days;
  })();
  const hasTaskSet = new Set(Object.keys(tasks).filter((k) => tasks[k]?.length > 0));
  const doneCount = dayTasks.filter((t) => t.done).length;
  const prog = dayTasks.length ? Math.round((doneCount / dayTasks.length) * 100) : 0;

  const upcoming7 = (() => {
    const r = [];
    for (let i = 1; i <= 7; i++) {
      const d = addDays(new Date(), i), k = toDateKey(d), ts = getTasksFor(k);
      if (ts.length) r.push({ date: d, dk: k, tasks: ts });
    }
    return r;
  })();

  // Sidebar content (shared between desktop and mobile)
  const sidebarContent = (
    <>
      <div style={S.logo}>
        <span style={{ fontSize: 20 }}>◉</span>
        <span style={S.logoText}>Chrono</span>
      </div>

      {/* Mini Calendar */}
      <div style={S.miniCal}>
        <div style={S.miniCalHead}>
          <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} style={S.calNav}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{MONTHS[calMonth.getMonth()].slice(0, 3)} {calMonth.getFullYear()}</span>
          <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} style={S.calNav}>›</button>
        </div>
        <div style={S.calGrid}>
          {DAYS.map((d) => <div key={d} style={S.calLabel}>{d[0]}</div>)}
          {calDays.map((d, i) => (
            <div key={i} onClick={() => d && (setSelDate(d), setMode("day"), setMobileSidebar(false))}
              style={{ ...S.calDay, cursor: d ? "pointer" : "default", opacity: d ? 1 : 0,
                ...(d && isSameDay(d, selDate) ? { background: "#2C2925", color: "#fff", fontWeight: 700 } : {}),
                ...(d && isSameDay(d, new Date()) && !isSameDay(d, selDate) ? { background: "#EDE9E3", fontWeight: 600 } : {}),
              }}>
              {d?.getDate()}
              {d && hasTaskSet.has(toDateKey(d)) && !isSameDay(d, selDate) && <div style={S.calDot} />}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={S.sideBlock}>
        <div style={S.statRow}><span style={S.statL}>Progress</span><span style={S.statV}>{doneCount}/{dayTasks.length}</span></div>
        <div style={S.progTrack}><div style={{ ...S.progBar, width: `${prog}%` }} /></div>
      </div>

      {/* Categories */}
      <div style={S.sideBlock}>
        <div style={S.sideTitle}>Categories</div>
        <button onClick={() => { setCatFilt("all"); setMobileSidebar(false); }} style={{ ...S.catBtn, ...(catFilt === "all" ? S.catBtnOn : {}) }}>All</button>
        {CATEGORIES.filter((c) => c.id !== "none").map((c) => (
          <button key={c.id} onClick={() => { setCatFilt(c.id); setMobileSidebar(false); }}
            style={{ ...S.catBtn, ...(catFilt === c.id ? { background: c.bg, color: c.color, fontWeight: 600 } : {}) }}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Upcoming */}
      {upcoming7.length > 0 && (
        <div style={S.sideBlock}>
          <div style={S.sideTitle}>Coming Up</div>
          {upcoming7.slice(0, 5).map((d) => (
            <button key={d.dk} onClick={() => { setSelDate(d.date); setMode("day"); setMobileSidebar(false); }} style={S.upBtn}>
              <span style={{ fontWeight: 600, color: "#2C2925" }}>{DAYS[d.date.getDay()]} {d.date.getDate()}</span>
              <span style={{ fontSize: 11, color: "#A09B94" }}>{d.tasks.length}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Manrope:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input,textarea,select,button{font-family:'Manrope',sans-serif}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D1CBC3;border-radius:4px}
        @keyframes slideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:.4}}
        .anim{animation:slideUp .3s ease-out both}
        .anim:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.08)}
        .pdot{animation:pulse 2s infinite ease-in-out}
        button{cursor:pointer;transition:all .15s}button:active{transform:scale(.96)}
        @media(max-width:800px){
          .desk-sidebar{display:none!important}
          .mob-toggle{display:flex!important}
        }
        @media(min-width:801px){
          .mob-toggle{display:none!important}
          .mob-overlay{display:none!important}
        }
      `}</style>

      <div style={S.layout}>
        {/* Desktop Sidebar */}
        <aside className="desk-sidebar" style={S.sidebar}>{sidebarContent}</aside>

        {/* Mobile Sidebar Overlay */}
        {mobileSidebar && (
          <div className="mob-overlay" onClick={() => setMobileSidebar(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 90, animation: "fadeIn .2s" }}>
            <aside onClick={(e) => e.stopPropagation()}
              style={{ ...S.sidebar, position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 91, boxShadow: "4px 0 24px rgba(0,0,0,0.12)" }}>
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main */}
        <main style={S.main}>
          {/* Top Bar */}
          <header style={S.topBar}>
            <div style={S.topLeft}>
              <button className="mob-toggle" onClick={() => setMobileSidebar(true)}
                style={{ ...S.navBtn, display: "none", fontSize: 18, width: 34, height: 34 }}>☰</button>
              <div style={S.viewToggle}>
                {["day", "week"].map((v) => (
                  <button key={v} onClick={() => setMode(v)}
                    style={{ ...S.vBtn, ...(mode === v ? S.vBtnOn : {}) }}>{v === "day" ? "Day" : "Week"}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button onClick={() => setSelDate(addDays(selDate, mode === "week" ? -7 : -1))} style={S.navBtn}>‹</button>
                <button onClick={() => setSelDate(new Date())} style={S.todayBtn}>Today</button>
                <button onClick={() => setSelDate(addDays(selDate, mode === "week" ? 7 : 1))} style={S.navBtn}>›</button>
              </div>
              <h1 style={S.dateH}>
                {mode === "week"
                  ? `${MONTHS[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()} – ${MONTHS[addDays(weekStart, 6).getMonth()].slice(0, 3)} ${addDays(weekStart, 6).getDate()}`
                  : `${FULL_DAYS[selDate.getDay()]}, ${MONTHS[selDate.getMonth()]} ${selDate.getDate()}`}
                {isToday && mode === "day" && <span style={S.todayTag}>Today</span>}
              </h1>
            </div>
            <div style={S.topRight}>
              <div style={S.searchBox}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#A09B94" }}>⌕</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." style={S.searchIn} />
              </div>
              <button onClick={() => { setShowImport(!showImport); setShowAdd(false); }} style={S.hdrBtn}>{showImport ? "✕" : "↑"} Import</button>
              <button onClick={() => { setShowAdd(!showAdd); setShowImport(false); }} style={S.addBtn2}>+ New</button>
            </div>
          </header>

          {/* Import Panel */}
          {showImport && (
            <div className="anim" style={S.panel}>
              <h3 style={S.panelH}>Import Schedule</h3>
              <p style={S.panelSub}>Format: <code style={S.code}>HH:MM - Task name [category]</code></p>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={SAMPLE} style={S.tArea} rows={7} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                <button onClick={() => setImportText(SAMPLE)} style={S.ghostBtn}>Load Sample</button>
                <button onClick={importData} style={S.solidBtn}>Import {importText.trim().split("\n").filter((l) => l.match(/^\d{1,2}:\d{2}/)).length} Tasks</button>
              </div>
            </div>
          )}

          {/* Add Task Panel */}
          {showAdd && (
            <div className="anim" style={S.panel}>
              <h3 style={S.panelH}>New Task</h3>
              <div style={S.addGrid}>
                <input type="time" value={nw.time} onChange={(e) => setNw({ ...nw, time: e.target.value })} style={S.inp} />
                <input value={nw.title} onChange={(e) => setNw({ ...nw, title: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addTask()} placeholder="What needs to be done?" style={{ ...S.inp, gridColumn: "span 2" }} />
                <select value={nw.duration} onChange={(e) => setNw({ ...nw, duration: e.target.value })} style={S.inp}>
                  {[5, 10, 15, 30, 45, 60, 90, 120, 180, 240].map((d) => <option key={d} value={d}>{fmtDur(d)}</option>)}
                </select>
                <select value={nw.category} onChange={(e) => setNw({ ...nw, category: e.target.value })} style={S.inp}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
                <select value={nw.priority} onChange={(e) => setNw({ ...nw, priority: e.target.value })} style={S.inp}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={nw.recurring} onChange={(e) => setNw({ ...nw, recurring: e.target.value })} style={S.inp}>
                  <option value="none">No Repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                </select>
                <button onClick={addTask} style={S.solidBtn}>Add</button>
              </div>
            </div>
          )}

          {/* Filters */}
          {mode === "day" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {["all", "pending", "upcoming", "done"].map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ ...S.chip, ...(filter === f ? S.chipOn : {}) }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>
                    {f === "all" ? dayTasks.length : f === "done" ? doneCount : f === "pending" ? dayTasks.length - doneCount : dayTasks.filter(t => t.totalMin > nowMin && !t.done).length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ─── DAY VIEW ─── */}
          {mode === "day" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {visible.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 20px", animation: "fadeIn .4s" }}>
                  <div style={{ fontSize: 44, marginBottom: 8, opacity: 0.5 }}>{dayTasks.length ? "🔍" : "📋"}</div>
                  <p style={{ fontSize: 14, color: "#A09B94" }}>{dayTasks.length ? "No tasks match your filters." : "No tasks for this day yet."}</p>
                </div>
              )}
              {visible.map((task, i) => {
                const cat = catMap[task.category] || catMap.none;
                const st = getStatus(task);
                const pri = PRIORITY[task.priority] || PRIORITY.low;
                const isEditing = editId === task.id;
                return (
                  <div key={task.id} className="anim"
                    style={{ ...S.card, animationDelay: `${i * 0.04}s`, opacity: task.done ? 0.55 : 1, borderLeft: `4px solid ${cat.color}`, flexDirection: isEditing ? "column" : "row", alignItems: isEditing ? "stretch" : "center" }}>

                    {isEditing ? (
                      /* ── Full Edit Mode ── */
                      <div style={{ animation: "slideUp .2s ease-out" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 600 }}>Edit Task</span>
                          <button onClick={cancelEdit} style={{ ...S.icoBtn, fontSize: 16 }}>✕</button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                          <div>
                            <label style={S.editLabel}>Time</label>
                            <input type="time" value={editForm.time} onChange={(e) => setEditForm({ ...editForm, time: e.target.value })} style={{ ...S.inp, width: "100%" }} />
                          </div>
                          <div>
                            <label style={S.editLabel}>Task</label>
                            <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                              style={{ ...S.inp, width: "100%" }} autoFocus />
                          </div>
                          <div>
                            <label style={S.editLabel}>Duration</label>
                            <select value={editForm.duration} onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })} style={{ ...S.inp, width: "100%" }}>
                              {[5, 10, 15, 30, 45, 60, 90, 120, 180, 240].map((d) => <option key={d} value={d}>{fmtDur(d)}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={S.editLabel}>Category</label>
                            <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} style={{ ...S.inp, width: "100%" }}>
                              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={S.editLabel}>Priority</label>
                            <select value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })} style={{ ...S.inp, width: "100%" }}>
                              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={S.editLabel}>Repeat</label>
                            <select value={editForm.recurring} onChange={(e) => setEditForm({ ...editForm, recurring: e.target.value })} style={{ ...S.inp, width: "100%" }}>
                              <option value="none">No Repeat</option>
                              <option value="daily">Daily</option>
                              <option value="weekdays">Weekdays</option>
                              <option value="weekly">Weekly</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                          <button onClick={cancelEdit} style={S.ghostBtn}>Cancel</button>
                          <button onClick={saveEdit} style={S.solidBtn}>Save Changes</button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal View ── */
                      <>
                        <div style={S.timeCol}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: st === "active" ? cat.color : "#6B6560" }}>{fmt12(task.h, task.m)}</span>
                          <span style={{ fontSize: 10, color: "#B5B0A8" }}>{fmtDur(task.duration)}</span>
                          {st === "active" && <div className="pdot" style={{ ...S.pDot, background: cat.color }} />}
                        </div>
                        <button onClick={() => toggle(task.id)}
                          style={{ ...S.chk, background: task.done ? cat.color : "transparent", borderColor: task.done ? cat.color : "#D1CBC3" }}>
                          {task.done && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, textDecoration: task.done ? "line-through" : "none", color: task.done ? "#A09B94" : "#2C2925" }}>
                            {task.title}
                          </span>
                          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: cat.bg, color: cat.color }}>{cat.icon} {cat.label}</span>
                            {task.priority === "high" && <span style={{ fontSize: 10, fontWeight: 600, color: pri.color }}>● {pri.label}</span>}
                            {task.recurring !== "none" && <span style={{ fontSize: 10, color: "#8A8580" }}>↻ {task.recurring}</span>}
                            {st === "active" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: cat.bg, color: cat.color }}>In progress</span>}
                            {st === "overdue" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "#FEF2F2", color: "#EF4444" }}>Overdue</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <button title="Edit task" onClick={() => startEdit(task)} style={{ ...S.icoBtn, color: "#8A8580" }}>✎</button>
                          <button title="Copy to tomorrow" onClick={() => dup(task, toDateKey(addDays(selDate, 1)))} style={S.icoBtn}>↗</button>
                          <button onClick={() => del(task.id)} style={{ ...S.icoBtn, color: "#D4CFC8" }}>✕</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── WEEK VIEW ─── */}
          {mode === "week" && (
            <div style={S.weekGrid}>
              {weekDates.map((wd) => {
                const wk = toDateKey(wd);
                const wt = getTasksFor(wk);
                const isSel = isSameDay(wd, selDate);
                const isTd = isSameDay(wd, new Date());
                return (
                  <div key={wk} onClick={() => { setSelDate(wd); setMode("day"); }}
                    style={{ ...S.weekCol, cursor: "pointer", ...(isSel ? { border: "1.5px solid #2C2925" } : {}), ...(isTd ? { background: "#FAFAF8" } : {}) }}>
                    <div style={{ textAlign: "center", paddingBottom: 8, borderBottom: "1px solid #EDE9E3", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#A09B94" }}>{DAYS[wd.getDay()]}</div>
                      <div style={{
                        fontSize: 16, fontWeight: 600, color: "#2C2925", margin: "2px auto", display: "inline-flex", alignItems: "center", justifyContent: "center",
                        ...(isTd ? { background: "#2C2925", color: "#fff", borderRadius: "50%", width: 28, height: 28 } : {}),
                      }}>{wd.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
                      {wt.slice(0, 6).map((t) => {
                        const c = catMap[t.category] || catMap.none;
                        return (
                          <div key={t.id} style={{ padding: "4px 7px", borderRadius: 6, borderLeft: `3px solid ${c.color}`, background: t.done ? "#F5F3F0" : c.bg, opacity: t.done ? 0.5 : 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: "#8A8580" }}>{fmt12(t.h, t.m)}</div>
                            <div style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
                          </div>
                        );
                      })}
                      {wt.length > 6 && <span style={{ fontSize: 10, color: "#A09B94", textAlign: "center" }}>+{wt.length - 6} more</span>}
                      {wt.length === 0 && <span style={{ fontSize: 11, color: "#C5C0B8", textAlign: "center", padding: 16 }}>—</span>}
                    </div>
                    {wt.length > 0 && <div style={{ paddingTop: 6, borderTop: "1px solid #EDE9E3", textAlign: "center", marginTop: "auto", fontSize: 10, color: "#A09B94" }}>{wt.filter((t) => t.done).length}/{wt.length}</div>}
                  </div>
                );
              })}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

const S = {
  root: { minHeight: "100vh", background: "#F5F2EE", fontFamily: "'Manrope', sans-serif", color: "#2C2925" },
  layout: { display: "flex", minHeight: "100vh" },
  sidebar: { width: 258, background: "#FAFAF8", borderRight: "1px solid #E8E4DE", padding: "18px 14px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", flexShrink: 0 },
  logo: { display: "flex", alignItems: "center", gap: 8 },
  logoText: { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 600, letterSpacing: "-.5px" },
  miniCal: { background: "#fff", borderRadius: 12, padding: 12, border: "1px solid #EDE9E3" },
  miniCalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  calNav: { width: 26, height: 26, border: "none", background: "transparent", fontSize: 18, color: "#8A8580", borderRadius: 6 },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, textAlign: "center" },
  calLabel: { fontSize: 10, color: "#A09B94", fontWeight: 600, padding: "3px 0" },
  calDay: { fontSize: 12, padding: "5px 0", borderRadius: 8, position: "relative", transition: "background .15s" },
  calDot: { width: 4, height: 4, borderRadius: "50%", background: "#3B82F6", position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)" },
  sideBlock: { display: "flex", flexDirection: "column", gap: 4 },
  sideTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#A09B94", marginBottom: 4 },
  statRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  statL: { fontSize: 11, color: "#A09B94" },
  statV: { fontSize: 12, fontWeight: 600, color: "#2C2925" },
  statBig: { fontSize: 18, fontFamily: "'Playfair Display', serif", color: "#2C2925", marginTop: 2 },
  progTrack: { height: 5, background: "#EDE9E3", borderRadius: 3, overflow: "hidden", marginTop: 4 },
  progBar: { height: "100%", background: "linear-gradient(90deg,#10B981,#34D399)", borderRadius: 3, transition: "width .5s" },
  catBtn: { display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", border: "none", background: "transparent", borderRadius: 7, fontSize: 12, color: "#6B6560", textAlign: "left", width: "100%" },
  catBtnOn: { background: "#EDE9E3", fontWeight: 600, color: "#2C2925" },
  upBtn: { display: "flex", justifyContent: "space-between", padding: "5px 10px", border: "none", background: "transparent", borderRadius: 7, fontSize: 12, width: "100%" },
  main: { flex: 1, padding: "18px 24px", overflowY: "auto", minWidth: 0 },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  topLeft: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  topRight: { display: "flex", alignItems: "center", gap: 6 },
  viewToggle: { display: "flex", background: "#EDEAE5", borderRadius: 9, padding: 3 },
  vBtn: { padding: "5px 14px", border: "none", borderRadius: 7, background: "transparent", fontSize: 13, fontWeight: 500, color: "#8A8580" },
  vBtnOn: { background: "#fff", color: "#2C2925", boxShadow: "0 1px 4px rgba(0,0,0,.07)" },
  navBtn: { width: 30, height: 30, border: "1px solid #E8E4DE", borderRadius: 8, background: "#fff", fontSize: 16, color: "#6B6560", display: "flex", alignItems: "center", justifyContent: "center" },
  todayBtn: { padding: "5px 12px", border: "1px solid #E8E4DE", borderRadius: 8, background: "#fff", fontSize: 12, fontWeight: 600, color: "#2C2925" },
  dateH: { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 },
  todayTag: { fontSize: 11, fontWeight: 700, background: "#ECFDF5", color: "#10B981", padding: "2px 10px", borderRadius: 20, fontFamily: "'Manrope',sans-serif" },
  searchBox: { position: "relative" },
  searchIn: { padding: "6px 10px 6px 28px", border: "1px solid #E8E4DE", borderRadius: 8, fontSize: 13, width: 150, outline: "none", background: "#fff", color: "#2C2925" },
  hdrBtn: { padding: "6px 12px", border: "1px solid #E8E4DE", borderRadius: 8, background: "#fff", fontSize: 12, fontWeight: 500, color: "#2C2925" },
  addBtn2: { padding: "6px 14px", border: "none", borderRadius: 8, background: "#2C2925", fontSize: 12, fontWeight: 600, color: "#fff" },
  panel: { background: "#fff", borderRadius: 14, padding: 20, marginBottom: 14, border: "1px solid #E8E4DE" },
  panelH: { fontFamily: "'Playfair Display', serif", fontSize: 17, marginBottom: 4 },
  panelSub: { fontSize: 12, color: "#8A8580", marginBottom: 8 },
  code: { fontFamily: "monospace", background: "#F3F0EB", padding: "1px 5px", borderRadius: 4, fontSize: 11 },
  tArea: { width: "100%", padding: 12, border: "1px solid #E0DCD6", borderRadius: 10, fontSize: 13, lineHeight: 1.7, resize: "vertical", outline: "none", color: "#2C2925", background: "#FAFAF8" },
  ghostBtn: { padding: "7px 14px", border: "1px dashed #D4CFC8", borderRadius: 8, background: "transparent", color: "#8A8580", fontSize: 12 },
  solidBtn: { padding: "8px 18px", border: "none", borderRadius: 8, background: "#2C2925", color: "#fff", fontSize: 13, fontWeight: 600 },
  addGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 10, alignItems: "center" },
  inp: { padding: "8px 10px", border: "1px solid #E0DCD6", borderRadius: 8, fontSize: 13, outline: "none", background: "#FAFAF8", color: "#2C2925" },
  chip: { padding: "5px 14px", border: "1px solid #E8E4DE", borderRadius: 20, background: "#fff", fontSize: 12, fontWeight: 500, color: "#8A8580", display: "flex", alignItems: "center" },
  chipOn: { background: "#2C2925", color: "#fff", borderColor: "#2C2925" },
  card: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fff", borderRadius: 12, transition: "all .2s", position: "relative" },
  timeCol: { minWidth: 72, display: "flex", flexDirection: "column", alignItems: "flex-end", position: "relative", paddingLeft: 8 },
  pDot: { position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%" },
  chk: { width: 20, height: 20, borderRadius: 6, border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 },
  miniSel: { padding: "3px 4px", border: "1px solid #E8E4DE", borderRadius: 6, fontSize: 11, color: "#8A8580", background: "transparent", outline: "none" },
  editLabel: { fontSize: 11, fontWeight: 600, color: "#8A8580", marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: ".04em" },
  icoBtn: { width: 24, height: 24, border: "none", background: "transparent", color: "#A09B94", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, padding: 0 },
  weekGrid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, animation: "fadeIn .3s" },
  weekCol: { background: "#fff", borderRadius: 12, padding: 10, minHeight: 300, display: "flex", flexDirection: "column", transition: "all .15s", border: "1.5px solid transparent" },
};
