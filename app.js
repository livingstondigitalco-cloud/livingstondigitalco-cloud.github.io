/* Livingston Laser Co — ornament preview (static, no backend). */
(function () {
  "use strict";

  const EMAIL = "livingstondigitalco@gmail.com";
  const PAYPAL_URL = "https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=tdart3%40gmail.com&item_name=Livingston+Laser+Co+ornament+deposit&currency_code=USD";
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
    const data = ctx.getImageData(0, 0, w, h);
    const cov = new Float32Array(w * h);
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    const cutoff = 1 - threshold;
    const soft = 0.05;
    for (let i = 0; i < cov.length; i++) {
      const o = i * 4;
      const a = data.data[o + 3] / 255;
      if (a < 0.04) continue;
      const lum =
        (0.299 * data.data[o] +
          0.587 * data.data[o + 1] +
          0.114 * data.data[o + 2]) /
        255;
      const ink = invert ? lum : 1 - lum;
      let v = (ink - (cutoff - soft)) / (2 * soft);
      v = Math.max(0, Math.min(1, v));
      v = v * v * (3 - 2 * v) * a;
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
    const style = currentStyleName();
    const text = (state.text || "").trim();
    const subject = "Holiday ornament order — " + qty + " ornaments";
    const logoLine = state.logoName
      ? "Logo file: " + state.logoName + " (please find it attached)."
      : "I will attach our logo to this email.";
    const body = [
      "Hi Livingston Laser Co,",
      "",
      "I'd like to order " + qty + " custom ornaments ($" + price + ").",
      "",
      "Style: " + style,
      "Custom text: " + (text || "(none)"),
      logoLine,
      "",
      "Business name:",
      "Contact name:",
      "Phone or best email:",
      "Delivery city (Howell / Brighton / Fowlerville):",
      "",
      "Thank you!",
    ].join("\n");
    els.cta.href =
      "mailto:" +
      EMAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    if (els.paypal) els.paypal.href = PAYPAL_URL;
    if (els.depositAmount) {
      const deposit = price / 2;
      els.depositAmount.textContent =
        "$" + (Number.isInteger(deposit) ? String(deposit) : deposit.toFixed(2));
    }
  }

  function syncQtyUI() {
    document.querySelectorAll(".qty-chip").forEach(function (btn) {
      btn.setAttribute("aria-checked", btn.getAttribute("data-qty") === String(state.qty) ? "true" : "false");
    });
    document.querySelectorAll(".price-card").forEach(function (card) {
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
    try {
      const img = await fileToImage(file);
      state.logo = img;
      state.logoName = file.name || "logo";
      setDropzoneLabel(state.logoName);
      if (!state.invertTouched) {
        const stats = meanLuminance(img);
        /* Light marks (white/pale logos, often on a transparent field) need invert.
           A mostly-opaque dark field with a light logo also needs invert. */
        const next =
          (stats.n > 0 && stats.lum >= 0.72) ||
          (stats.opaqueRatio > 0.65 && stats.lum < 0.38);
        state.invert = next;
        els.invert.checked = next;
      }
      updateMailto();
      requestRender();
    } catch (err) {
      console.error(err);
      els.dropTitle.textContent = "Could not read that file. Try a PNG, JPG, or SVG.";
    }
  }

  function bind() {
    els.canvas = $("ornament");
    els.ribbon = $("ribbon");
    els.stage = $("preview-stage");
    els.styleGrid = $("style-grid");
    els.qtyRow = $("qty-row");
    els.cta = $("mailto-cta");
    els.paypal = $("paypal-cta");
    els.depositAmount = $("deposit-amount");
    els.dropzone = $("dropzone");
    els.dropTitle = $("dropzone-title");
    els.logoInput = $("logo-input");
    els.threshold = $("threshold");
    els.thresholdReadout = $("threshold-readout");
    els.invert = $("invert");
    els.text = $("custom-text");

    els.canvas.width = DESIGN + SHADOW_PAD * 2;
    els.canvas.height = DESIGN + RIBBON_PAD + SHADOW_PAD;

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
      onLogoFile(file);
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

    document.querySelectorAll(".price-card").forEach(function (card) {
      card.addEventListener("click", function () {
        state.qty = Number(card.getAttribute("data-qty"));
        syncQtyUI();
      });
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
