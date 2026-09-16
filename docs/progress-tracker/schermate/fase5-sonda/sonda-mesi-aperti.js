(async () => { document.querySelectorAll("details").forEach((d) => (d.open = true)); await new Promise((r) => setTimeout(r, 300)); const celle = document.querySelectorAll("[data-disciplina]").length; const r = await 
(async () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0,0,1,1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0,0,1,1); const d = cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255]; };
  const lum = ([r,g,b]) => { const f = (v) => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const mix = (top, bot) => [0,1,2].map(i => top[i]*top[3] + bot[i]*(1-top[3]));
  function bgOf(el) {
    const stack = []; let e = el;
    while (e) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] >= 1) break; e = e.parentElement; }
    let base = [255,255,255];
    if (!stack.length || stack[stack.length-1][3] < 1) base = rgba(getComputedStyle(document.body).backgroundColor).slice(0,3);
    for (let i = stack.length-1; i >= 0; i--) base = mix(stack[i], base);
    return base;
  }
  function ratio(el) {
    const cs = getComputedStyle(el); const fg0 = rgba(cs.color); const bg = bgOf(el);
    const op = parseFloat(cs.opacity);
    const fg = mix([fg0[0],fg0[1],fg0[2],fg0[3]*op], bg);
    const a = lum(fg), b = lum(bg); return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  }
  const scope = document.querySelector("main") || document.body;
  const sec = document.querySelector("[data-heatmap]");
  const textEls = [...scope.querySelectorAll("*")].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden");
  const piccoli = []; const bassi = []; const bassiCal = [];
  for (const e of textEls) {
    const fs = parseFloat(getComputedStyle(e).fontSize);
    const t = [...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(" ").slice(0,40);
    if (fs < 11) piccoli.push(fs + " " + t);
    const r = ratio(e);
    if (r < 4.5) (sec && sec.contains(e) ? bassiCal : bassi).push(r.toFixed(2) + " " + t + (e.closest("[aria-hidden=true]") ? " [aria-hidden]" : ""));
  }
  const titoli = [...document.querySelectorAll("main [data-slot=card-title]")].map(e => e.textContent.trim().slice(0,28) + " @" + Math.round(e.getBoundingClientRect().top + scrollY));
  const sbordi = [...scope.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length;
  const cr = sec?.getBoundingClientRect();
  return {
    altezza: document.documentElement.scrollHeight, innerWidth, scrollWidth: document.documentElement.scrollWidth, sbordi,
    heatmap: cr ? { top: Math.round(cr.top + scrollY), h: Math.round(cr.height), w: Math.round(cr.width) } : null,
    titoli, piccoli: [...new Set(piccoli)].slice(0,15), bassi: [...new Set(bassi)].slice(0,15), bassiCal: [...new Set(bassiCal)].slice(0,20),
  };
})();
 r.celleHeatmap = celle; r.gradini = [0,1,2,3].map((t) => document.querySelectorAll(`[data-disciplina="${t}"]`).length); return r; })()
