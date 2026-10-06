// Auditoria de contraste do texto sobre o fundo em degradê (colar no console do navegador, com a tela aberta).
// Para cada texto, calcula o contraste contra o pior ponto do fundo (azul #3067AD até lavanda #BEC1D2), considerando os
// painéis de vidro (translucidez) que estiverem por trás. Lista o que fica abaixo de 3:1 (grande/negrito) ou 4.5:1 (pequeno).
(() => {
  const samples = [[48, 103, 173], [111, 152, 207], [169, 189, 224], [190, 193, 210]];
  const parse = (c) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const over = (top, bottom) => {
    const a = top.a;
    return [top.r * a + bottom[0] * (1 - a), top.g * a + bottom[1] * (1 - a), top.b * a + bottom[2] * (1 - a)];
  };
  const layersOf = (el) => {
    const out = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const bg = parse(getComputedStyle(e).backgroundColor);
      if (bg && bg.a > 0.02) out.push(bg);
      if (bg && bg.a >= 0.98) break;
    }
    return out.reverse();
  };
  const res = [];
  const seen = new Set();
  document.querySelectorAll("main *").forEach((el) => {
    if (!el.childNodes.length) return;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return;
    const fg = parse(cs.color);
    if (!fg) return;
    const layers = layersOf(el);
    const opaque = layers.length && layers[0].a >= 0.98;
    let worst = 99;
    for (const base of opaque ? [[layers[0].r, layers[0].g, layers[0].b]] : samples) {
      let bg = base;
      for (const l of opaque ? layers.slice(1) : layers) bg = over(l, bg);
      const text = over(fg, bg);
      worst = Math.min(worst, ratio(text, bg));
    }
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 600;
    const need = size >= 24 || (size >= 18.5 && bold) ? 3 : 4.5;
    if (worst < need) {
      const key = el.tagName + "|" + cs.color + "|" + (el.className.toString().slice(0, 60));
      if (seen.has(key)) return;
      seen.add(key);
      res.push({ texto: el.innerText.trim().slice(0, 30), contraste: +worst.toFixed(1), precisa: need, cor: cs.color, classe: el.className.toString().slice(0, 70) });
    }
  });
  return res.sort((a, b) => a.contraste - b.contraste).slice(0, 14);
})();
