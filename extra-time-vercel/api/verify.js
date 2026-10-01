// Fonction serverless Vercel : relaie le prompt vers une IA gratuite et renvoie du JSON.
// Variables d'environnement : GROQ_API_KEY (recommandé) ou GEMINI_API_KEY.
// Optionnel : GROQ_MODEL, GEMINI_MODEL.
const fs = require("fs"), path = require("path");
const nz = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
let DB = null, PIDX = null, TR = null, CL = null;
try {
  for (const p of [path.join(process.cwd(), "data/db.json"), path.join(__dirname, "../data/db.json")]) {
    if (fs.existsSync(p)) { DB = JSON.parse(fs.readFileSync(p, "utf8")); break; }
  }
  if (DB) {
    PIDX = {}; TR = {}; CL = Object.entries(DB.clubs).map(([id, n]) => [id, nz(n)]);
    for (const [id, p] of Object.entries(DB.players)) (PIDX[nz(p[0])] = PIDX[nz(p[0])] || []).push(id);
    for (const t of DB.tr) (TR[t[0]] = TR[t[0]] || []).push(t);
  }
} catch (e) { DB = null; }
const best = ids => ids.sort((a, b) => DB.players[b][4] - DB.players[a][4])[0];
function findPlayer(name) {
  const q = nz(name); if (!DB || !q) return null;
  if (PIDX[q]) return best(PIDX[q]);
  const tk = q.split(" "), c = [];
  for (const [k, ids] of Object.entries(PIDX)) if (tk.every(t => k.split(" ").includes(t))) c.push(...ids);
  if (!c.length) for (const [k, ids] of Object.entries(PIDX)) if (k && k.split(" ").every(t => tk.includes(t))) c.push(...ids);
  return c.length ? best(c) : null;
}
const ALIAS = { "fc barcelone": "barcelona", "psg": "paris saint", "bayern munich": "bayern", "ac milan": "milan", "inter": "internazionale", "atletico madrid": "atletico", "dortmund": "dortmund", "olympique de marseille": "marseille", "olympique lyonnais": "lyon", "manchester city": "manchester city", "manchester united": "manchester united" };
function findClub(name) {
  const k = ALIAS[nz(name)] || nz(name); if (!DB || !k) return null;
  const re = new RegExp("\\b" + k.replace(/ /g, "\\s+") + "\\b");
  const m = CL.filter(([, n]) => re.test(n));
  if (!m.length) return null;
  return m.sort((a, b) => a[1].length - b[1].length)[0][0];
}
function facts(ctx) {
  if (!DB || !ctx) return "";
  const L = [], cs = (ctx.c || []).map(findClub).filter(Boolean), cn = id => DB.clubs[id] || id;
  for (const nm of (ctx.p || []).slice(0, 12)) {
    const id = findPlayer(nm);
    if (!id) { L.push(`- "${nm}" : absent de la base (joueur peut-être récent ou peu connu)`); continue; }
    const [n, pos, ct, cl] = DB.players[id];
    let s = `- ${n} : poste ${pos || "?"}, nationalité ${ct || "?"}, clubs connus : ${cl.map(cn).slice(0, 25).join(", ")}`;
    for (const c of cs) { const v = DB.st[id + ":" + c]; s += `; avec ${cn(c)} : ` + (v ? `${v[0]} buts, ${v[1]} passes (apparitions suivies seulement, donc partiel)` : "aucune stat suivie (ne prouve rien)"); }
    const t = (TR[id] || []).slice(0, 12);
    if (t.length) s += "; transferts payants : " + t.map(x => `${cn(x[1])} -> ${cn(x[2])} ${x[3]} ${x[4]} M€`).join(" | ");
    L.push(s);
  }
  return L.length ? "\n\nFAITS ISSUS DE LA BASE TRANSFERMARKT (dataset ouvert arrêté à juillet 2026). Priorité sur ta mémoire pour clubs, transferts, montants, postes et nationalités. Les buts/passes de la base sont partiels : utilise-les comme minimum, sinon estime et dis-le dans la note. Absent de la base ne veut pas dire inexistant (mercato récent).\n" + L.join("\n") : "";
}
const clean = t => JSON.parse(String(t).replace(/```json|```/g, "").trim());

async function groq(prompt) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Tu es un arbitre de quizz de foot. Réponds uniquement par du JSON valide. Si tu n'es pas sûr, dis-le dans le champ prévu plutôt que d'inventer." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error("groq " + r.status);
  return clean((await r.json()).choices[0].message.content);
}

async function gemini(prompt) {
  const m = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    }
  );
  if (!r.ok) throw new Error("gemini " + r.status);
  return clean((await r.json()).candidates[0].content.parts[0].text);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const prompt0 = req.body && req.body.prompt;
  const prompt = typeof prompt0 === "string" ? prompt0 + facts(req.body.ctx) : prompt0;
  if (typeof prompt !== "string" || prompt.length > 16000) return res.status(400).json({ error: "bad prompt" });
  try {
    let out;
    if (process.env.GROQ_API_KEY) {
      try { out = await groq(prompt); } catch (e) { if (!process.env.GEMINI_API_KEY) throw e; }
    }
    if (!out && process.env.GEMINI_API_KEY) out = await gemini(prompt);
    if (!out) return res.status(500).json({ error: "no API key configured" });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
};
