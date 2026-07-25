// Превращает отрисованный экран в SVG с настоящими слоями.
//
// Скриншот в Figma — картинка, её нельзя править. Здесь мы обходим DOM уже
// отрисованного приложения и переводим каждый элемент в векторную фигуру:
// фон и рамка → <rect>, текст → <text>, картинка → <image>. В Figma это
// приезжает отдельными слоями с именами, их можно двигать и менять.
//
// Функция выполняется внутри страницы (page.evaluate), поэтому написана без
// импортов и на обычном ES5-подобном синтаксисе.

window.__domToSvg = function domToSvg(opts) {
  const W = opts.width, H = opts.height;
  const out = [];
  let clipId = 0;

  const num = (v) => parseFloat(v) || 0;
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Прозрачное? rgba(...,0) и transparent
  function invisible(color) {
    if (!color) return true;
    if (color === 'transparent' || color === 'none') return true;
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(',').map(parseFloat);
    return parts.length === 4 && parts[3] === 0;
  }

  // Имя слоя: по тексту, тегу и роли — чтобы в Figma список слоёв читался
  function layerName(el, txt) {
    if (txt) return txt.slice(0, 28);
    if (el.tagName === 'IMG') return 'image';
    const cls = (el.getAttribute('class') || '').split(' ')[0];
    return cls ? cls.slice(0, 24) : el.tagName.toLowerCase();
  }

  function radius(cs, r) {
    const vals = ['borderTopLeftRadius', 'borderTopRightRadius',
                  'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => num(cs[k]));
    const max = Math.min(r.width, r.height) / 2;
    return Math.min(Math.max.apply(null, vals), max);
  }

  const all = document.querySelectorAll('body *');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (num(cs.opacity) === 0) continue;

    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;

    const op = num(cs.opacity) === 1 ? '' : ` opacity="${num(cs.opacity)}"`;
    const rx = radius(cs, r);
    const rxAttr = rx > 0.5 ? ` rx="${rx.toFixed(1)}"` : '';

    // ── Фон ───────────────────────────────────────────────────────────
    if (!invisible(cs.backgroundColor)) {
      out.push(`<rect data-name="${esc(layerName(el))}" x="${r.left.toFixed(1)}" y="${r.top.toFixed(1)}" `
        + `width="${r.width.toFixed(1)}" height="${r.height.toFixed(1)}"${rxAttr} `
        + `fill="${cs.backgroundColor}"${op}/>`);
    }

    // ── Рамка ─────────────────────────────────────────────────────────
    const bw = num(cs.borderTopWidth);
    if (bw > 0 && !invisible(cs.borderTopColor)) {
      const half = bw / 2;
      out.push(`<rect data-name="border" x="${(r.left + half).toFixed(1)}" y="${(r.top + half).toFixed(1)}" `
        + `width="${Math.max(0, r.width - bw).toFixed(1)}" height="${Math.max(0, r.height - bw).toFixed(1)}"`
        + `${rx > 0.5 ? ` rx="${Math.max(0, rx - half).toFixed(1)}"` : ''} `
        + `fill="none" stroke="${cs.borderTopColor}" stroke-width="${bw}"${op}/>`);
    }

    // ── Картинки ──────────────────────────────────────────────────────
    if (el.tagName === 'IMG' && el.src) {
      out.push(`<image data-name="${esc(layerName(el))}" x="${r.left.toFixed(1)}" y="${r.top.toFixed(1)}" `
        + `width="${r.width.toFixed(1)}" height="${r.height.toFixed(1)}" href="${esc(el.src)}" `
        + `preserveAspectRatio="xMidYMid slice"${op}/>`);
      continue;
    }
    const bg = cs.backgroundImage;
    if (bg && bg !== 'none' && bg.indexOf('url(') === 0) {
      const url = bg.slice(4, -1).replace(/^["']|["']$/g, '');
      out.push(`<image data-name="bg" x="${r.left.toFixed(1)}" y="${r.top.toFixed(1)}" `
        + `width="${r.width.toFixed(1)}" height="${r.height.toFixed(1)}" href="${esc(url)}" `
        + `preserveAspectRatio="xMidYMid meet"${op}/>`);
    }

    // ── SVG внутри страницы (иконки-вектор) ───────────────────────────
    if (el.tagName === 'svg') {
      const clone = el.cloneNode(true);
      clone.setAttribute('x', r.left.toFixed(1));
      clone.setAttribute('y', r.top.toFixed(1));
      clone.setAttribute('width', r.width.toFixed(1));
      clone.setAttribute('height', r.height.toFixed(1));
      out.push(clone.outerHTML);
    }
  }

  // ── Текст: по строкам, с точными координатами ──────────────────────
  // Строки собираем сами, посимвольно, группируя по верхней границе. На
  // range.getClientRects() полагаться нельзя: при переносе и обрезке
  // (numberOfLines) он отдаёт то одну область на весь абзац, то лишние.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const txt = node.nodeValue;
    if (!txt || !txt.trim()) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === 'none' || cs.visibility === 'hidden' || num(cs.opacity) === 0) continue;

    const pr = parent.getBoundingClientRect();
    const lines = lineGroups(node);
    const size = num(cs.fontSize);
    const anchor = cs.textAlign === 'center' ? 'middle'
                 : cs.textAlign === 'right' ? 'end' : 'start';

    for (const ln of lines) {
      if (!ln.text.trim()) continue;
      if (ln.bottom < 0 || ln.top > H) continue;
      // Обрезанный текст (numberOfLines) не рисуем ниже своего блока
      if (ln.top >= pr.bottom - 1) continue;

      const baseline = ln.top + (ln.height + size * 0.72) / 2 - size * 0.09;
      const x = anchor === 'middle' ? (ln.left + ln.right) / 2
              : anchor === 'end' ? ln.right : ln.left;

      // Иконки в приложении — шрифт (Ionicons и родня). В Figma такого
      // шрифта нет, глиф стал бы пустым квадратом. Помечаем, чтобы потом
      // заменить контуром: символ из области частного использования.
      const cp = ln.text.codePointAt(0);
      if (ln.text.trim().length <= 2 && cp >= 0xE000 && cp <= 0xF8FF) {
        const fam = cs.fontFamily.replace(/["']/g, '').split(',')[0].trim();
        out.push(`<g data-icon="${esc(fam)}" data-cp="${cp.toString(16)}" `
          + `data-x="${ln.left.toFixed(1)}" data-y="${baseline.toFixed(1)}" `
          + `data-size="${size}" data-fill="${cs.color}"></g>`);
        continue;
      }

      out.push(`<text data-name="${esc(ln.text.slice(0, 28))}" x="${x.toFixed(1)}" y="${baseline.toFixed(1)}" `
        + `font-family="${esc(cs.fontFamily.replace(/"/g, ''))}" font-size="${size}" `
        + `font-weight="${cs.fontWeight}" fill="${cs.color}"`
        + `${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}`
        + `${cs.fontStyle === 'italic' ? ' font-style="italic"' : ''}`
        + `${num(cs.letterSpacing) ? ` letter-spacing="${num(cs.letterSpacing)}"` : ''}`
        + `>${esc(ln.text)}</text>`);
    }
  }

  /** Строки текстового узла: текст и его точная рамка на экране */
  function lineGroups(node) {
    const text = node.nodeValue;
    const range = document.createRange();
    const groups = [];
    let cur = null;
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getClientRects()[0];
      if (!rect || rect.width === 0) {           // пробел на переносе
        if (cur) cur.text += text[i];
        continue;
      }
      const top = Math.round(rect.top);
      if (!cur || Math.abs(cur.topRaw - top) > 1) {
        cur = { text: text[i], topRaw: top, top: rect.top, bottom: rect.bottom,
                height: rect.height, left: rect.left, right: rect.right };
        groups.push(cur);
      } else {
        cur.text += text[i];
        cur.right = Math.max(cur.right, rect.right);
        cur.left = Math.min(cur.left, rect.left);
      }
    }
    return groups.map(g => ({ ...g, text: g.text.trim() })).filter(g => g.text);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${getComputedStyle(document.body).backgroundColor || '#fff'}"/>`
    + out.join('\n') + '</svg>';
};
