/* Dart Wood Design — ornament + keychain previews and order forms (static site; orders post to FormSubmit). */
window.__laser = window.__laser || {};
(function (L) {
  "use strict";
  L.MAX_BYTES = 10 * 1024 * 1024;
  L.isSupported = function (file) {
    return /^image\/(png|jpeg|svg\+xml)$/.test(file.type || "") || /\.(png|jpe?g|svg)$/i.test(file.name || "");
  };
  L.putFileInInput = function (input, file) {
    if (!input || !file) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    } catch (err) {
      /* Older browsers: the preview still works; the order form will ask for the file. */
    }
  };
  L.bindPriceCard = function (card, select, targetId) {
    function go() {
      select();
      const t = document.getElementById(targetId);
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    card.addEventListener("click", go);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  };
})(window.__laser);

/* Dart Wood Design — ornament preview (static, no backend). */
(function () {
  "use strict";

  const EMAIL = "livingstondigitalco@gmail.com";
  const PAYPAL_URL = "https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=tdart3%40gmail.com&item_name=Dart+Wood+Design+ornament+deposit&currency_code=USD";
  const DESIGN = 1000;
  const SHADOW_PAD = 80;
  const RIBBON_PAD = 152;
  const HOLE_CX = 500;
  const HOLE_CY = (5.5 / 89) * 1000;
  const BURN = [0.33, 0.2, 0.1];
  const GROOVE = [0.5, 0.35, 0.2];

  /* Styles are swappable: drop an SVG in  and add a row here.
     See README.md for the convention. */
  const STYLES = [
    { id: "bauble", name: "Ornate Bauble", src: "bauble.svg" },
    { id: "snowflake", name: "Snowflake", src: "snowflake.svg" },
    { id: "tree", name: "Christmas Tree", src: "tree.svg" },
  ];

  const WOOD_SRC = {
    bauble: "wood-bauble.webp",
    snowflake: "wood-snowflake.webp",
    tree: "wood-tree.webp",
  };

  const PRICES = { 25: 100, 50: 175, 100: 300 };

  const state = {
    styleId: "bauble",
    threshold: 0.5,
    invert: false,
    invertTouched: false,
    text: "",
    qty: 50,
    logo: null,
    logoName: "",
    ready: false,
    renderCount: 0,
  };

  const els = {};
  const cache = { images: {}, styles: {}, fonts: false };

  function $(id) {
    return document.getElementById(id);
  }

  function loadImage(src) {
    if (cache.images[src]) return cache.images[src];
    cache.images[src] = new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Could not load " + src));
      };
      img.src = src;
    });
    return cache.images[src];
  }

  function ensureSvgSize(text) {
    if (/<svg[^>]*\b(width|viewBox)\s*=/i.test(text)) {
      if (!/<\s*svg[^>]*\bwidth\s*=/i.test(text) && /viewBox/i.test(text)) {
        text = text.replace(/<svg\b/i, '<svg width="1024" height="1024"');
      }
      return text;
    }
    return text.replace(/<svg\b/i, '<svg width="1024" height="1024" viewBox="0 0 1024 1024"');
  }

  function fileToImage(file) {
    if (!file) return Promise.resolve(null);
    const isSvg =
      file.type === "image/svg+xml" || /\.svg$/i.test(file.name || "");
    if (isSvg) {
      return file.text().then(function (text) {
        const blob = new Blob([ensureSvgSize(text)], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        return loadImage(url).then(function (img) {
          return img;
        });
      });
    }
    const url = URL.createObjectURL(file);
    return loadImage(url);
  }

  function meanLuminance(img) {
    const s = 64;
    const c = document.createElement("canvas");
    c.width = s;
    c.height = s;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, s, s);
    const d = ctx.getImageData(0, 0, s, s).data;
    let sum = 0,
      n = 0,
      opaque = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 20) continue;
      opaque++;
      sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      n++;
    }
    return { lum: n ? sum / n : 1, opaqueRatio: opaque / (s * s), n: n };
  }

  async function groupCoverage(doc, groupId, size) {
    const group = doc.getElementById(groupId);
    if (!group || !group.childElementCount) return null;
    const svg = doc.documentElement;
    const viewBox = svg.getAttribute("viewBox") || "0 0 1000 1000";
    const serialized = new XMLSerializer().serializeToString(group);
    const wrapper =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="' +
      viewBox +
      '" width="' +
      size +
      '" height="' +
      size +
      '">' +
      serialized +
      "</svg>";
    const url = URL.createObjectURL(new Blob([wrapper], { type: "image/svg+xml" }));
    try {
      const img = await loadImage(url);
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size);
      const cov = new Float32Array(size * size);
      let any = false;
      for (let i = 0; i < cov.length; i++) {
        const o = i * 4;
        const a = data.data[o + 3] / 255;
        if (a < 0.02) continue;
        const lum =
          (0.299 * data.data[o] +
            0.587 * data.data[o + 1] +
            0.114 * data.data[o + 2]) /
          255;
        const v = a * Math.max(1 - lum, a * 0.35);
        if (v > 0.02) {
          cov[i] = Math.min(1, v);
          any = true;
        }
      }
      return any ? cov : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function loadStyle(style) {
    if (cache.styles[style.id]) return cache.styles[style.id];
    const text = await fetch(style.src).then(function (r) {
      if (!r.ok) throw new Error("Missing style " + style.src);
      return r.text();
    });
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.documentElement;
    const wood = svg.getAttribute("data-wood") || "circle";
    const area = doc.getElementById("logo-area");
    const logoArea = area
      ? {
          x: parseFloat(area.getAttribute("x")) || 200,
          y: parseFloat(area.getAttribute("y")) || 180,
          w: parseFloat(area.getAttribute("width")) || 600,
          h: parseFloat(area.getAttribute("height")) || 550,
        }
      : { x: 200, y: 180, w: 600, h: 550 };
    const holeEl = doc.getElementById("hang-hole");
    const hangHole = {
      cx: holeEl ? parseFloat(holeEl.getAttribute("cx")) || HOLE_CX : HOLE_CX,
      cy: holeEl ? parseFloat(holeEl.getAttribute("cy")) || HOLE_CY : HOLE_CY,
    };
    const [engrave, score] = await Promise.all([
      groupCoverage(doc, "ENGRAVE", DESIGN),
      groupCoverage(doc, "SCORE", DESIGN),
    ]);
    cache.styles[style.id] = {
      wood: wood,
      logoArea: logoArea,
      engrave: engrave,
      score: score,
      hangHole: hangHole,
    };
    return cache.styles[style.id];
  }

  function processLogo(img, threshold, invert) {
    const maxSide = 900;
    let w = img.naturalWidth || img.width || 0;
    let h = img.naturalHeight || img.height || 0;
    if (!w || !h) return null;
    const scale = Math.min(maxSide / w, maxSide / h, 1);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const n = w * h;

    /* Work out the background from the border pixels. Logos come as dark or
       colored marks on white, light marks on dark, or any color on a
       transparent field, so measure each pixel's contrast against that
       background instead of its raw darkness. */
    let bR = 0, bG = 0, bB = 0, bN = 0, clearEdge = 0, edgeN = 0;
    function edge(i) {
      const o = i * 4;
      edgeN++;
      if (px[o + 3] < 128) { clearEdge++; return; }
      bR += px[o]; bG += px[o + 1]; bB += px[o + 2]; bN++;
    }
    for (let x = 0; x < w; x++) { edge(x); edge((h - 1) * w + x); }
    for (let y = 1; y < h - 1; y++) { edge(y * w); edge(y * w + w - 1); }
    const clearBg = clearEdge / Math.max(1, edgeN) > 0.5 || bN === 0;
    if (bN) { bR /= bN; bG /= bN; bB /= bN; }

    const raw = new Float32Array(n);
    const alpha = new Float32Array(n);
    let minL = 1, maxL = 0, maxD = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const a = px[o + 3] / 255;
      alpha[i] = a;
      if (a < 0.04) continue;
      if (clearBg) {
        const lum = (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
        raw[i] = lum;
        if (a > 0.5) { if (lum < minL) minL = lum; if (lum > maxL) maxL = lum; }
      } else {
        const dr = px[o] - bR, dg = px[o + 1] - bG, db = px[o + 2] - bB;
        const d = Math.sqrt(dr * dr + dg * dg + db * db) / 441.7;
        raw[i] = d;
        if (d > maxD) maxD = d;
      }
    }
    const range = maxL - minL;
    const dNorm = Math.max(maxD, 0.12);

    const cov = new Float32Array(n);
    let minX = w, minY = h, maxX = 0, maxY = 0;
    const cutoff = 1 - threshold;
    const soft = 0.05;
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      if (a < 0.04) continue;
      let ink;
      if (clearBg) {
        /* Transparent field: every visible pixel is part of the logo. Lighter
           details inside a multi-tone logo stay unburned. */
        ink = range < 0.25 ? 1 : (maxL - raw[i]) / range;
      } else {
        ink = Math.min(1, raw[i] / dNorm);
      }
      if (invert) ink = 1 - ink;
      let v = (ink - (cutoff - soft)) / (2 * soft);
      v = Math.max(0, Math.min(1, v));
      v = v * v * (3 - 2 * v) * (clearBg ? a : 1);
      if (v <= 0.02) continue;
      cov[i] = v;
      if (v <= 0.08) continue;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX < minX) return null;
    return { cov: cov, w: w, h: h, minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function trimPaste(dest, dw, src, dx, dy, tw, th) {
    const sw = src.maxX - src.minX + 1;
    const sh = src.maxY - src.minY + 1;
    if (sw <= 0 || sh <= 0 || tw <= 1 || th <= 1) return;
    for (let y = 0; y < th; y++) {
      const sy = src.minY + ((y + 0.5) * sh) / th;
      const y0 = Math.floor(sy);
      const y1 = Math.min(src.h - 1, y0 + 1);
      const fy = sy - y0;
      const dyi = dy + y;
      if (dyi < 0 || dyi >= DESIGN) continue;
      for (let x = 0; x < tw; x++) {
        const sx = src.minX + ((x + 0.5) * sw) / tw;
        const x0 = Math.floor(sx);
        const x1 = Math.min(src.w - 1, x0 + 1);
        const fx = sx - x0;
        const dxi = dx + x;
        if (dxi < 0 || dxi >= dw) continue;
        const v00 = src.cov[y0 * src.w + x0] || 0;
        const v10 = src.cov[y0 * src.w + x1] || 0;
        const v01 = src.cov[y1 * src.w + x0] || 0;
        const v11 = src.cov[y1 * src.w + x1] || 0;
        const v = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
        if (v > 0.01) {
          const i = dyi * dw + dxi;
          if (v > dest[i]) dest[i] = v;
        }
      }
    }
  }

  function textCoverage(text, maxW, fontPx) {
    const pad = 8;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.font = "600 " + fontPx + "px Cinzel, serif";
    const width = Math.ceil(ctx.measureText(text).width) + pad * 2;
    const height = Math.ceil(fontPx * 1.35) + pad * 2;
    c.width = width;
    c.height = height;
    const ctx2 = c.getContext("2d", { willReadFrequently: true });
    ctx2.font = "600 " + fontPx + "px Cinzel, serif";
    ctx2.textBaseline = "middle";
    ctx2.textAlign = "center";
    ctx2.fillStyle = "#000";
    ctx2.fillText(text, width / 2, height / 2 + fontPx * 0.04);
    const data = ctx2.getImageData(0, 0, width, height);
    const cov = new Float32Array(width * height);
    let minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    for (let i = 0; i < cov.length; i++) {
      const v = data.data[i * 4 + 3] / 255;
      if (v < 0.05) continue;
      cov[i] = v;
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX < minX) return null;
    /* Scale down horizontally if the measured text exceeded maxW. */
    const src = { cov: cov, w: width, h: height, minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    return src;
  }

  function buildContentCoverage(logoArea, hasLogo, logoSrc, text) {
    const dest = new Float32Array(DESIGN * DESIGN);
    const pad = 8;
    const ax = logoArea.x + pad;
    const ay = logoArea.y + pad;
    const aw = logoArea.w - pad * 2;
    const ah = logoArea.h - pad * 2;
    const hasText = !!(text && text.trim());
    const textBand = hasText ? Math.min(86, ah * 0.22) : 0;
    const ruleH = hasText ? 18 : 0;
    const logoH = ah - textBand - ruleH;
    const logoBox = { x: ax, y: ay, w: aw, h: Math.max(40, logoH) };

    if (hasLogo && logoSrc) {
      const sw = logoSrc.maxX - logoSrc.minX + 1;
      const sh = logoSrc.maxY - logoSrc.minY + 1;
      const scale = Math.min(logoBox.w / sw, logoBox.h / sh);
      const tw = Math.max(1, Math.round(sw * scale));
      const th = Math.max(1, Math.round(sh * scale));
      const dx = Math.round(logoBox.x + (logoBox.w - tw) / 2);
      const dy = Math.round(logoBox.y + (logoBox.h - th) / 2);
      trimPaste(dest, DESIGN, logoSrc, dx, dy, tw, th);
    } else if (!hasText) {
      const placeholder = textCoverage("YOUR LOGO", aw, 54);
      if (placeholder) {
        const sw = placeholder.maxX - placeholder.minX + 1;
        const sh = placeholder.maxY - placeholder.minY + 1;
        const scale = Math.min((aw * 0.85) / sw, (ah * 0.25) / sh);
        const tw = Math.max(1, Math.round(sw * scale));
        const th = Math.max(1, Math.round(sh * scale));
        const dx = Math.round(ax + (aw - tw) / 2);
        const dy = Math.round(ay + (ah - th) / 2);
        const tmp = new Float32Array(DESIGN * DESIGN);
        trimPaste(tmp, DESIGN, placeholder, dx, dy, tw, th);
        for (let i = 0; i < dest.length; i++) if (tmp[i]) dest[i] = tmp[i] * 0.42;
      }
    }

    if (hasText) {
      const t = text.trim();
      let fontPx = 48;
      let src = textCoverage(t, aw, fontPx);
      if (src) {
        let sw = src.maxX - src.minX + 1;
        if (sw > aw * 0.98) {
          fontPx = Math.max(22, Math.floor(fontPx * (aw * 0.95) / sw));
          src = textCoverage(t, aw, fontPx);
        }
      }
      if (src) {
        const sw = src.maxX - src.minX + 1;
        const sh = src.maxY - src.minY + 1;
        const scale = Math.min(aw / sw, (textBand * 0.85) / sh);
        const tw = Math.max(1, Math.round(sw * scale));
        const th = Math.max(1, Math.round(sh * scale));
        const dx = Math.round(ax + (aw - tw) / 2);
        const textY = ay + ah - textBand + (textBand - th) / 2;
        const dy = Math.round(textY);
        /* Hairline rule above the text */
        const ruleY = Math.round(dy - 14);
        const ruleW = Math.min(aw * 0.42, 220);
        const rx0 = Math.round(ax + (aw - ruleW) / 2);
        for (let x = rx0; x < rx0 + ruleW; x++) {
          for (let tky = 0; tky < 3; tky++) {
            const i = (ruleY + tky) * DESIGN + x;
            if (i >= 0 && i < dest.length) dest[i] = Math.max(dest[i], tky === 1 ? 0.9 : 0.45);
          }
        }
        trimPaste(dest, DESIGN, src, dx, dy, tw, th);
      }
    }

    let any = false;
    for (let i = 0; i < dest.length; i++) {
      if (dest[i] > 0.01) {
        any = true;
        break;
      }
    }
    return any ? dest : null;
  }

  function applyBurn(imageData, coverage, color, amount) {
    if (!coverage) return;
    const d = imageData.data;
    for (let i = 0; i < coverage.length; i++) {
      const c = coverage[i] * amount;
      if (c <= 0.01) continue;
      const o = i * 4;
      if (d[o + 3] < 10) continue;
      const k = c > 1 ? 1 : c;
      d[o] = d[o] * (1 - k) + color[0] * 255 * k;
      d[o + 1] = d[o + 1] * (1 - k) + color[1] * 255 * k;
      d[o + 2] = d[o + 2] * (1 - k) + color[2] * 255 * k;
    }
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = DESIGN;
  offscreen.height = DESIGN;

  let lastPacked = null;

  function positionRibbon() {
    const canvas = els.canvas;
    const ribbon = els.ribbon;
    if (!canvas || !ribbon) return;
    const stageW = canvas.clientWidth || canvas.width;
    const scale = stageW / canvas.width;
    const ornSize = DESIGN;
    const ox = SHADOW_PAD;
    const oy = RIBBON_PAD;
    const hole = (lastPacked && lastPacked.hangHole) || { cx: HOLE_CX, cy: HOLE_CY };
    const holeX = (ox + (hole.cx / DESIGN) * ornSize) * scale;
    const holeY = (oy + (hole.cy / DESIGN) * ornSize) * scale;
    const rw = stageW * 0.68;
    const rh = rw * (260 / 600);
    const anchorY = 158 / 260;
    ribbon.style.width = rw + "px";
    ribbon.style.height = "auto";
    ribbon.style.left = holeX - rw / 2 + "px";
    ribbon.style.top = holeY - rh * anchorY + "px";
    ribbon.style.transform = "none";
  }

  async function ensureFonts() {
    if (cache.fonts) return;
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load("600 64px Cinzel"),
          document.fonts.load("500 16px Outfit"),
        ]);
      }
    } catch (err) {
      /* system fallback is fine */
    }
    cache.fonts = true;
  }

  let renderQueued = false;
  let renderGen = 0;

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      render();
    });
  }

  async function render() {
    const my = ++renderGen;
    const canvas = els.canvas;
    if (!canvas) return;
    await ensureFonts();
    const styleMeta = STYLES.find(function (s) {
      return s.id === state.styleId;
    });
    let packed;
    try {
      packed = await loadStyle(styleMeta);
    } catch (err) {
      console.error(err);
      packed = { wood: "bauble", logoArea: { x: 200, y: 180, w: 600, h: 550 }, engrave: null, score: null, hangHole: { cx: HOLE_CX, cy: HOLE_CY } };
    }
    if (my !== renderGen) return;
    lastPacked = packed;
    const wood = await loadImage(WOOD_SRC[packed.wood] || WOOD_SRC.bauble);
    if (my !== renderGen) return;

    const octx = offscreen.getContext("2d", { willReadFrequently: true });
    octx.clearRect(0, 0, DESIGN, DESIGN);
    octx.drawImage(wood, 0, 0, DESIGN, DESIGN);

    const logoSrc = state.logo
      ? processLogo(state.logo, state.threshold, state.invert)
      : null;
    const content = buildContentCoverage(
      packed.logoArea,
      !!state.logo,
      logoSrc,
      state.text
    );

    const img = octx.getImageData(0, 0, DESIGN, DESIGN);
    applyBurn(img, packed.engrave, BURN, 1);
    applyBurn(img, packed.score, GROOVE, 0.62);
    applyBurn(img, content, BURN, 1);
    octx.putImageData(img, 0, 0);

    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    /* Soft drop shadow that follows the ornament alpha */
    ctx.save();
    ctx.shadowColor = "rgba(60, 40, 20, 0.48)";
    ctx.shadowBlur = 32;
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 18;
    ctx.drawImage(offscreen, SHADOW_PAD, RIBBON_PAD);
    ctx.restore();
    ctx.drawImage(offscreen, SHADOW_PAD, RIBBON_PAD);

    positionRibbon();
    state.ready = true;
    state.renderCount = (state.renderCount || 0) + 1;
    window.__previewReady = true;
  }

  function currentStyleName() {
    const s = STYLES.find(function (x) {
      return x.id === state.styleId;
    });
    return s ? s.name : "Ornate Bauble";
  }

  function updateMailto() {
    const qty = state.qty;
    const price = PRICES[qty];
    const deposit = price / 2;
    const style = currentStyleName();
    const money = function (n) {
      return "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));
    };
    function setVal(id, v) {
      const el = $(id);
      if (el) el.value = v;
    }
    setVal("orn-f-subject", "New ornament order — " + qty + " ornaments");
    setVal("orn-f-qty", qty + " ornaments");
    setVal("orn-f-price", money(price) + " (" + money(price / qty) + " each)");
    setVal("orn-f-deposit", money(deposit));
    setVal("orn-f-style", style);
    setVal("orn-f-next", "https://livingstondigitalco-cloud.github.io/?thanks=ornament&qty=" + qty + "#order");
    if (els.summary) {
      els.summary.innerHTML =
        "Your order: <strong>" + qty + " ornaments</strong> · " + style + " · <strong>" + money(price) + "</strong>";
    }
    if (els.paypal) {
      els.paypal.href =
        PAYPAL_URL.replace("ornament+deposit", "ornament+deposit+-+" + qty + "+ornaments") +
        "&amount=" + deposit.toFixed(2);
    }
    if (els.depositAmount) els.depositAmount.textContent = money(deposit);
    if (els.depositQty) els.depositQty.textContent = qty + " ornaments";
    document.dispatchEvent(new CustomEvent("llc:orderchange", { detail: { pfx: "orn" } }));
  }

  function syncQtyUI() {
    document.querySelectorAll("#qty-row .qty-chip").forEach(function (btn) {
      btn.setAttribute("aria-checked", btn.getAttribute("data-qty") === String(state.qty) ? "true" : "false");
    });
    document.querySelectorAll("#pricing .price-card").forEach(function (card) {
      card.classList.toggle("is-selected", card.getAttribute("data-qty") === String(state.qty));
    });
    updateMailto();
  }

  function styleThumb(id) {
    const stroke = "#5c3a1e";
    const fill = "#e6d3a6";
    if (id === "tree") {
      return (
        '<svg class="thumb" viewBox="0 0 64 64" aria-hidden="true">' +
        '<path d="M32 4 L36 14 L47 14 L38 22 L42 33 L32 26 L22 33 L26 22 L17 14 L28 14 Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.3" stroke-linejoin="round"/>' +
        '<circle cx="32" cy="16" r="2.1" fill="none" stroke="' + stroke + '" stroke-width="1.3"/>' +
        '<path d="M32 24 L18 40 H24 L14 52 H26 L22 60 H42 L38 52 H50 L40 40 H46 Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.4" stroke-linejoin="round"/>' +
        '<rect x="29.5" y="59.5" width="5" height="3.5" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2"/>' +
        '<circle cx="32" cy="40" r="7.5" fill="none" stroke="' + stroke + '" stroke-width="1.1"/>' +
        "</svg>"
      );
    }
    if (id === "snowflake") {
      return (
        '<svg class="thumb" viewBox="0 0 64 64" aria-hidden="true">' +
        '<path d="M32 8 L35 14 L39 12 L37 18 L43 18 L38 22 L43 26 L37 26 L39 32 L35 30 L32 36 L29 30 L25 32 L27 26 L21 26 L26 22 L21 18 L27 18 L25 12 L29 14 Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<circle cx="32" cy="10.5" r="2.2" fill="none" stroke="' + stroke + '" stroke-width="1.3"/>' +
        '<circle cx="32" cy="38" r="12.5" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.4"/>' +
        '<circle cx="32" cy="38" r="10" fill="none" stroke="' + stroke + '" stroke-width="1"/>' +
        "</svg>"
      );
    }
    /* bauble */
    let petals = "";
    for (let i = 0; i < 8; i++) {
      const a = (-90 + (360 - 40) * (i + 0.5) / 8) * Math.PI / 180;
      const x = 32 + Math.cos(a) * 16.5;
      const y = 35.5 + Math.sin(a) * 16.5;
      petals += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.1" fill="none" stroke="' + stroke + '" stroke-width="1.05"/>';
    }
    return (
      '<svg class="thumb" viewBox="0 0 64 64" aria-hidden="true">' +
      '<path d="M27 14 Q27 9 32 8 Q37 9 37 14 L38 18 Q32 20 26 18 Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<circle cx="32" cy="11" r="2" fill="none" stroke="' + stroke + '" stroke-width="1.3"/>' +
      '<circle cx="32" cy="35.5" r="20" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/>' +
      petals +
      '<circle cx="32" cy="35.5" r="11" fill="none" stroke="' + stroke + '" stroke-width="1.1"/>' +
      "</svg>"
    );
  }

  function buildStyleGrid() {
    const grid = els.styleGrid;
    grid.innerHTML = "";
    STYLES.forEach(function (style) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "style-card";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", style.id === state.styleId ? "true" : "false");
      btn.setAttribute("data-style", style.id);
      btn.innerHTML = styleThumb(style.id) + "<span>" + style.name + "</span>";
      btn.addEventListener("click", function () {
        state.styleId = style.id;
        grid.querySelectorAll(".style-card").forEach(function (el) {
          el.setAttribute("aria-checked", el.getAttribute("data-style") === style.id ? "true" : "false");
        });
        updateMailto();
        requestRender();
      });
      grid.appendChild(btn);
    });
  }

  function buildQtyRow() {
    const row = els.qtyRow;
    row.innerHTML = "";
    [25, 50, 100].forEach(function (qty) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qty-chip";
      btn.setAttribute("role", "radio");
      btn.setAttribute("data-qty", String(qty));
      btn.setAttribute("aria-checked", qty === state.qty ? "true" : "false");
      btn.innerHTML = "<strong>" + qty + "</strong><em>$" + PRICES[qty] + "</em>";
      btn.addEventListener("click", function () {
        state.qty = qty;
        syncQtyUI();
      });
      row.appendChild(btn);
    });
  }

  function setDropzoneLabel(name) {
    if (name) {
      els.dropTitle.textContent = name;
      els.dropzone.classList.add("has-file");
    } else {
      els.dropTitle.textContent = "Drop a PNG, JPG, or SVG, or click to upload";
      els.dropzone.classList.remove("has-file");
    }
  }

  async function onLogoFile(file) {
    if (!file) return;
    if (!window.__laser.isSupported(file)) {
      els.dropTitle.textContent = "That file type won’t work. Please use a PNG, JPG, or SVG.";
      return;
    }
    try {
      const img = await fileToImage(file);
      state.logo = img;
      state.logoName = file.name || "logo";
      setDropzoneLabel(state.logoName);
      if (!state.invertTouched) {
        /* Contrast against the detected background handles light, dark, and
           colored logos, so start un-inverted. */
        const next = false;
        state.invert = next;
        els.invert.checked = next;
      }
      updateMailto();
      requestRender();
      document.dispatchEvent(new CustomEvent("llc:logo", { detail: { pfx: "orn", name: state.logoName } }));
    } catch (err) {
      console.warn(err);
      els.dropTitle.textContent = "We couldn’t read that file. Try a PNG, JPG, or SVG.";
    }
  }

  function bind() {
    els.canvas = $("ornament");
    els.ribbon = $("ribbon");
    els.stage = $("preview-stage");
    els.styleGrid = $("style-grid");
    els.qtyRow = $("qty-row");
    els.summary = $("orn-summary");
    els.paypal = $("orn-paypal");
    els.depositAmount = $("orn-deposit-amount");
    els.depositQty = $("orn-deposit-qty");
    els.dropzone = $("dropzone");
    els.dropTitle = $("dropzone-title");
    els.logoInput = $("logo-input");
    els.threshold = $("threshold");
    els.thresholdReadout = $("threshold-readout");
    els.invert = $("invert");
    els.text = $("custom-text");

    els.canvas.width = DESIGN + SHADOW_PAD * 2;
    els.canvas.height = DESIGN + RIBBON_PAD + SHADOW_PAD;

    const params = new URLSearchParams(window.location.search);
    if (params.get("thanks") === "ornament" && PRICES[Number(params.get("qty"))]) {
      state.qty = Number(params.get("qty"));
    }

    buildStyleGrid();
    buildQtyRow();
    syncQtyUI();

    els.logoInput.addEventListener("change", function (e) {
      const file = e.target.files && e.target.files[0];
      onLogoFile(file);
    });

    ["dragenter", "dragover"].forEach(function (ev) {
      els.dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        els.dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      els.dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        els.dropzone.classList.remove("dragover");
      });
    });
    els.dropzone.addEventListener("drop", function (e) {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) window.__laser.putFileInInput(els.logoInput, file);
      onLogoFile(file);
    });

    els.text.addEventListener("keydown", function (e) {
      if (e.key === "Enter") e.preventDefault();
    });

    els.threshold.addEventListener("input", function () {
      state.threshold = Number(els.threshold.value) / 100;
      els.thresholdReadout.textContent = String(els.threshold.value);
      requestRender();
    });

    els.invert.addEventListener("change", function () {
      state.invert = els.invert.checked;
      state.invertTouched = true;
      requestRender();
    });

    els.text.addEventListener("input", function () {
      state.text = els.text.value;
      updateMailto();
      requestRender();
    });

    document.querySelectorAll("#pricing .price-card").forEach(function (card) {
      window.__laser.bindPriceCard(card, function () {
        state.qty = Number(card.getAttribute("data-qty"));
        syncQtyUI();
      }, "order");
    });

    window.addEventListener("resize", positionRibbon);
    if (window.ResizeObserver) {
      new ResizeObserver(positionRibbon).observe(els.stage);
    }

    requestRender();
  }

  window.__preview = {
    get state() {
      return state;
    },
    render: render,
    setLogoFile: onLogoFile,
  };
  window.__laser.fileToImage = fileToImage;
  window.__laser.processLogo = processLogo;
  window.__laser.loadImage = loadImage;
  window.__laser.BURN = BURN;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();


/* Logo keychains: live preview, quantity, deposit. */
(function () {
  "use strict";
  const L = window.__laser;
  const PAYPAL_BASE =
    "https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=tdart3%40gmail.com&item_name=Dart+Wood+Design+keychain+deposit&currency_code=USD";
  const PRICES = { 25: 75, 50: 125, 100: 200 };
  /* Engrave area on keychain.svg (720 x 320 units): right of the ring hole. */
  const AREA = { x: 262, y: 92, w: 380, h: 136 };
  const SCALE = 2;
  const els = {};
  const state = { qty: 50, logoName: "", logo: null };
  let svgText = null;

  function $(id) {
    return document.getElementById(id);
  }

  function money(n) {
    return "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));
  }

  function updateOrder() {
    const qty = state.qty;
    const price = PRICES[qty];
    const deposit = price / 2;
    function setVal(id, v) {
      const el = $(id);
      if (el) el.value = v;
    }
    setVal("kc-f-subject", "New keychain order — " + qty + " keychains");
    setVal("kc-f-qty", qty + " keychains");
    setVal("kc-f-price", money(price) + " (" + money(price / qty) + " each)");
    setVal("kc-f-deposit", money(deposit));
    setVal("kc-f-next", "https://livingstondigitalco-cloud.github.io/?thanks=keychain&qty=" + qty + "#keychain-order");
    if (els.summary) {
      els.summary.innerHTML =
        "Your order: <strong>" + qty + " logo keychains</strong> · 2.5 × 1.25 in · <strong>" + money(price) + "</strong>";
    }
    if (els.paypal) {
      els.paypal.href =
        PAYPAL_BASE.replace("keychain+deposit", "keychain+deposit+-+" + qty + "+keychains") +
        "&amount=" + deposit.toFixed(2);
    }
    if (els.depositAmount) els.depositAmount.textContent = money(deposit);
    if (els.depositQty) els.depositQty.textContent = qty + " keychains";
    document.dispatchEvent(new CustomEvent("llc:orderchange", { detail: { pfx: "kc" } }));
  }

  function syncQtyUI() {
    document.querySelectorAll("#keychain-qty-row .qty-chip").forEach(function (btn) {
      btn.setAttribute("aria-checked", btn.getAttribute("data-qty") === String(state.qty) ? "true" : "false");
    });
    document.querySelectorAll("#keychains .keychain-price-card").forEach(function (card) {
      card.classList.toggle("is-selected", card.getAttribute("data-qty") === String(state.qty));
    });
    updateOrder();
  }

  function buildQtyRow() {
    const row = els.qtyRow;
    row.innerHTML = "";
    [25, 50, 100].forEach(function (qty) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qty-chip";
      btn.setAttribute("role", "radio");
      btn.setAttribute("data-qty", String(qty));
      btn.innerHTML = "<strong>" + qty + "</strong><em>$" + PRICES[qty] + "</em>";
      btn.addEventListener("click", function () {
        state.qty = qty;
        syncQtyUI();
      });
      row.appendChild(btn);
    });
  }

  function setDropzoneLabel(text, hasFile) {
    els.dropTitle.textContent = text;
    els.dropzone.classList.toggle("has-file", !!hasFile);
  }

  async function render() {
    const canvas = els.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    try {
      if (svgText === null) {
        svgText = await fetch("keychain.svg").then(function (r) {
          if (!r.ok) throw new Error("Missing keychain.svg");
          return r.text();
        });
      }
      let text = svgText;
      if (state.logo) {
        /* Drop the "YOUR LOGO" placeholder when a real logo is shown. */
        text = text.replace(/<g id="kc-placeholder"[\s\S]*?<\/g>/, "");
      }
      const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
      const base = await new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () {
          resolve(img);
        };
        img.onerror = reject;
        img.src = url;
      });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      return;
    }
    if (!state.logo) {
      window.__keychainReady = true;
      return;
    }
    const src = L.processLogo(state.logo, 0.5, false);
    if (!src) {
      window.__keychainReady = true;
      return;
    }
    const sw = src.maxX - src.minX + 1;
    const sh = src.maxY - src.minY + 1;
    const mask = document.createElement("canvas");
    mask.width = sw;
    mask.height = sh;
    const mctx = mask.getContext("2d");
    const md = mctx.createImageData(sw, sh);
    const c = L.BURN;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const v = src.cov[(src.minY + y) * src.w + src.minX + x] || 0;
        const o = (y * sw + x) * 4;
        md.data[o] = c[0] * 255;
        md.data[o + 1] = c[1] * 255;
        md.data[o + 2] = c[2] * 255;
        md.data[o + 3] = Math.min(255, v * 255 * 0.92);
      }
    }
    mctx.putImageData(md, 0, 0);
    const box = { x: AREA.x * SCALE, y: AREA.y * SCALE, w: AREA.w * SCALE, h: AREA.h * SCALE };
    const k = Math.min(box.w / sw, box.h / sh);
    const tw = sw * k;
    const th = sh * k;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mask, box.x + (box.w - tw) / 2, box.y + (box.h - th) / 2, tw, th);
    window.__keychainReady = true;
  }

  async function onLogoFile(file) {
    if (!file) return;
    if (!L.isSupported(file)) {
      setDropzoneLabel("That file type won’t work. Please use a PNG, JPG, or SVG.", false);
      return;
    }
    try {
      state.logo = await L.fileToImage(file);
      state.logoName = file.name || "logo";
      setDropzoneLabel(state.logoName, true);
      updateOrder();
      render();
      document.dispatchEvent(new CustomEvent("llc:logo", { detail: { pfx: "kc", name: state.logoName } }));
    } catch (err) {
      console.warn(err);
      setDropzoneLabel("We couldn’t read that file. Try a PNG, JPG, or SVG.", false);
    }
  }

  function bind() {
    els.qtyRow = $("keychain-qty-row");
    els.summary = $("kc-summary");
    els.paypal = $("kc-paypal");
    els.depositAmount = $("kc-deposit-amount");
    els.depositQty = $("kc-deposit-qty");
    els.dropzone = $("keychain-dropzone");
    els.dropTitle = $("keychain-dropzone-title");
    els.logoInput = $("keychain-logo-input");
    els.canvas = $("keychain-canvas");
    if (!els.qtyRow) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("thanks") === "keychain" && PRICES[Number(params.get("qty"))]) {
      state.qty = Number(params.get("qty"));
    }

    buildQtyRow();
    syncQtyUI();
    render();

    els.logoInput.addEventListener("change", function (e) {
      onLogoFile(e.target.files && e.target.files[0]);
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      els.dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        els.dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      els.dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        els.dropzone.classList.remove("dragover");
      });
    });
    els.dropzone.addEventListener("drop", function (e) {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) L.putFileInInput(els.logoInput, file);
      onLogoFile(file);
    });

    document.querySelectorAll("#keychains .keychain-price-card").forEach(function (card) {
      L.bindPriceCard(card, function () {
        state.qty = Number(card.getAttribute("data-qty"));
        syncQtyUI();
      }, "keychain-order");
    });
  }

  window.__keychain = {
    get state() {
      return state;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();

/* Order forms: validation, FormSubmit post, thank-you state, email fallback. */
(function () {
  "use strict";
  const L = window.__laser;
  const EMAIL = "livingstondigitalco@gmail.com";

  function $(id) {
    return document.getElementById(id);
  }

  function setup(form) {
    const pfx = form.getAttribute("data-pfx");
    const product = form.getAttribute("data-product");
    const f = function (name) {
      return $(pfx + "-" + name);
    };
    const fileInput = form.querySelector('input[type="file"]');
    const submit = f("submit");
    const SUBMIT_LABEL = submit.textContent;

    function showErr(name, msg) {
      const p = f(name + "-err");
      const input = f(name);
      if (p) {
        p.textContent = msg || "";
        p.hidden = !msg;
      }
      if (input) {
        if (msg) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
        if (p) input.setAttribute("aria-describedby", p.id);
      }
    }

    function hasFile() {
      return !!(fileInput && fileInput.files && fileInput.files.length);
    }

    function updateLogoStatus() {
      const status = f("logo-status");
      const later = f("logo-later");
      const logoField = f("f-logo");
      if (hasFile()) {
        const file = fileInput.files[0];
        const mb = file.size / (1024 * 1024);
        status.textContent = "✓ " + file.name + " will be sent with your order.";
        status.classList.add("ok");
        if (logoField) logoField.value = file.name + " (attached, " + (mb < 1 ? Math.max(1, Math.round(file.size / 1024)) + " KB" : mb.toFixed(1) + " MB") + ")";
        later.checked = false;
        later.disabled = true;
        later.closest(".check").classList.add("is-disabled");
        showErr("logo", "");
      } else {
        status.textContent = "No logo added yet. Upload it in the box above.";
        status.classList.remove("ok");
        if (logoField) logoField.value = later.checked ? "Not attached. Customer will email it." : "";
        later.disabled = false;
        later.closest(".check").classList.remove("is-disabled");
      }
    }

    const ADDR = ["street", "city", "state", "zip"];
    const ADDR_INPUTS = ["street", "apt", "city", "state", "zip"];

    function normZip(raw) {
      const t = String(raw || "").trim();
      let m = /^(\d{5})(?:[-\s]?(\d{4}))?$/.exec(t);
      if (!m) return "";
      return m[2] ? m[1] + "-" + m[2] : m[1];
    }

    function addressLine() {
      if (f("pickup").checked) return "Local pickup in Howell, MI";
      const v = function (n) {
        return f(n).value.trim();
      };
      const street = [v("street"), v("apt")].filter(Boolean).join(", ");
      const zip = normZip(v("zip")) || v("zip");
      const cityState = [v("city"), v("state")].filter(Boolean).join(", ");
      const last = [cityState, zip].filter(Boolean).join(" ");
      return [street, last].filter(Boolean).join(", ");
    }

    function syncPickup() {
      const on = f("pickup").checked;
      ADDR_INPUTS.forEach(function (n) {
        f(n).disabled = on;
      });
      f("addr").classList.toggle("is-off", on);
      if (on)
        ADDR.forEach(function (n) {
          showErr(n, "");
        });
    }

    function validate() {
      const errs = [];
      function need(name, msg) {
        const el = f(name);
        if (!el.value.trim()) {
          showErr(name, msg);
          errs.push(el);
        } else showErr(name, "");
      }
      need("business", "Please add your business name.");
      need("contact", "Please add your name so we know who to email.");
      const email = f("email");
      const ev = email.value.trim();
      if (!ev) {
        showErr("email", "Please add your email. That’s where we send your proof.");
        errs.push(email);
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev)) {
        showErr("email", "That email doesn’t look quite right. Please check it.");
        errs.push(email);
      } else showErr("email", "");
      if (f("pickup").checked) {
        ADDR.forEach(function (n) {
          showErr(n, "");
        });
      } else {
        need("street", "Please add the street address we should ship to, or check local pickup.");
        need("city", "Please add the city.");
        need("state", "Please choose the state.");
        const zip = f("zip");
        const zv = normZip(zip.value);
        if (!zip.value.trim()) {
          showErr("zip", "Please add the ZIP code.");
          errs.push(zip);
        } else if (!zv) {
          showErr("zip", "ZIP codes are 5 digits, like 48843 (or ZIP+4, like 48843-1234).");
          errs.push(zip);
        } else showErr("zip", "");
      }
      if (hasFile()) {
        const file = fileInput.files[0];
        if (file.size > L.MAX_BYTES) {
          showErr("logo", "That logo file is over 10 MB. Please use a smaller file, or check “I’ll email my logo later.”");
          errs.push(f("logo-later"));
        } else if (!L.isSupported(file)) {
          showErr("logo", "Please upload a PNG, JPG, or SVG logo.");
          errs.push(f("logo-later"));
        } else showErr("logo", "");
      } else if (!f("logo-later").checked) {
        showErr("logo", "Please upload your logo above, or check “I’ll email my logo later.”");
        errs.push(f("logo-later"));
      } else showErr("logo", "");
      const top = f("form-err");
      if (errs.length) {
        top.textContent = errs.length === 1 ? "Please fix the item marked below." : "Please fix the " + errs.length + " items marked below.";
        top.hidden = false;
      } else {
        top.hidden = true;
      }
      return errs;
    }

    function orderText() {
      const v = function (id) {
        const el = f(id);
        return el ? el.value.trim() : "";
      };
      const lines = ["Hi Dart Wood Design,", "", "I'd like to order " + v("f-qty") + " (" + v("f-price") + ")."];
      if (product === "ornament") {
        const t = $("custom-text");
        lines.push("Style: " + v("f-style"));
        lines.push("Custom text: " + ((t && t.value.trim()) || "(none)"));
      } else {
        lines.push("Size: 2.5 x 1.25 in, split ring included.");
      }
      lines.push("I'll attach our logo to this email.");
      lines.push("");
      lines.push("Business name: " + v("business"));
      lines.push("Contact name: " + v("contact"));
      if (v("phone")) lines.push("Phone: " + v("phone"));
      lines.push(f("pickup").checked ? "Local pickup in Howell, MI" : "Ship to: " + addressLine());
      if (v("notes")) lines.push("Notes: " + v("notes"));
      lines.push("", "Thank you!");
      return lines.join("\n");
    }

    function updateFallback() {
      const g = f("gmail");
      if (!g) return;
      g.href =
        "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(EMAIL) +
        "&su=" + encodeURIComponent(f("f-subject").value) +
        "&body=" + encodeURIComponent(orderText());
      f("f-replyto").value = f("email").value.trim();
      f("f-address").value = addressLine();
    }

    form.addEventListener("input", function (e) {
      updateFallback();
      const id = e.target.id || "";
      if (id.indexOf(pfx + "-") === 0 && !f("form-err").hidden) validate();
    });
    form.addEventListener("change", function (e) {
      if (e.target === f("pickup")) syncPickup();
      if (e.target === f("zip")) {
        const z = normZip(f("zip").value);
        if (z) f("zip").value = z;
      }
      if (e.target === fileInput || e.target === f("logo-later")) updateLogoStatus();
      if (!f("form-err").hidden) validate();
      updateFallback();
    });
    document.addEventListener("llc:logo", function (e) {
      if (e.detail.pfx === pfx) updateLogoStatus();
    });
    document.addEventListener("llc:orderchange", function (e) {
      if (e.detail.pfx === pfx) updateFallback();
    });

    form.addEventListener("submit", function (e) {
      const errs = validate();
      if (errs.length) {
        e.preventDefault();
        errs[0].focus();
        return;
      }
      const z = normZip(f("zip").value);
      if (z) f("zip").value = z;
      updateFallback();
      updateLogoStatus();
      submit.disabled = true;
      submit.textContent = hasFile() ? "Sending your order and logo…" : "Sending your order…";
      form.setAttribute("aria-busy", "true");
    });

    /* If someone comes back with the Back button, make the form usable again. */
    window.addEventListener("pageshow", function () {
      submit.disabled = false;
      submit.textContent = SUBMIT_LABEL;
      form.removeAttribute("aria-busy");
      syncPickup();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("thanks") === product) {
      f("fields").hidden = true;
      f("thanks").hidden = false;
      setTimeout(function () {
        const box = f("thanks").closest(".order-box");
        box.scrollIntoView({ block: "start" });
        f("thanks").focus({ preventScroll: true });
      }, 60);
    }

    syncPickup();
    updateLogoStatus();
    updateFallback();
  }

  function bind() {
    document.querySelectorAll("form[data-pfx]").forEach(setup);

    document.querySelectorAll(".thanks-again").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const pfx = btn.getAttribute("data-again");
        $(pfx + "-thanks").hidden = true;
        $(pfx + "-fields").hidden = false;
        if (window.history && history.replaceState) {
          history.replaceState(null, "", window.location.pathname + window.location.hash);
        }
        $(pfx + "-business").focus();
      });
    });

    document.querySelectorAll(".copy-addr").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const text = btn.getAttribute("data-copy");
        const label = btn.textContent;
        function done(ok) {
          btn.textContent = ok ? "Copied!" : "Press Ctrl+C to copy";
          setTimeout(function () {
            btn.textContent = label;
          }, 2000);
        }
        function legacy() {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          let ok = false;
          try {
            ok = document.execCommand("copy");
          } catch (err) {
            ok = false;
          }
          document.body.removeChild(ta);
          done(ok);
        }
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(function () {
            done(true);
          }, legacy);
        } else legacy();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
