(() => {
  'use strict';

  const feed = document.getElementById('feed');
  const hero = document.getElementById('hero');
  const lb = document.getElementById('lightbox');
  const stage = document.getElementById('lbStage');
  const lbImg = document.getElementById('lbImg');
  const lbCount = document.getElementById('lbCount');
  const lbHint = document.getElementById('lbHint');
  const btnClose = document.getElementById('lbClose');
  const btnPrev = document.getElementById('lbPrev');
  const btnNext = document.getElementById('lbNext');

  const MAX_SCALE = 6;
  const DOUBLE_TAP_SCALE = 2.5;

  let photos = [];
  let slides = [];
  let buttons = [];
  let index = 0;

  /* ---------- Загрузка списка фото ---------- */

  function showMessage(text) {
    hero.classList.add('is-empty');
    const p = document.createElement('p');
    p.className = 'msg';
    p.textContent = text;
    feed.appendChild(p);
  }

  async function load() {
    try {
      const res = await fetch('photos.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const names = await res.json();
      photos = names.map(n => 'photos/' + encodeURIComponent(n));
    } catch (err) {
      showMessage('Не удалось загрузить фотографии. Обновите страницу.');
      return;
    }
    if (!photos.length) {
      showMessage('Фотографии скоро появятся.');
      return;
    }
    render();
  }

  function render() {
    const frag = document.createDocumentFragment();
    photos.forEach((src, i) => {
      const slide = document.createElement('section');
      slide.className = 'slide';

      const fig = document.createElement('figure');
      fig.className = 'frame';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-btn';
      btn.setAttribute('aria-label', 'Открыть фото ' + (i + 1) + ' из ' + photos.length);

      const img = new Image();
      img.alt = 'Скуратовский котик, фото ' + (i + 1);
      img.decoding = 'async';
      img.draggable = false;
      img.loading = i < 2 ? 'eager' : 'lazy';
      img.addEventListener('load', () => fig.classList.add('loaded'));
      img.addEventListener('error', () => slide.remove());
      img.src = src;

      btn.appendChild(img);
      btn.addEventListener('click', () => openAt(i, btn));
      fig.appendChild(btn);
      slide.appendChild(fig);
      frag.appendChild(slide);

      slides.push(slide);
      buttons.push(btn);
    });
    feed.appendChild(frag);
  }

  /* ---------- Просмотр: открытие, закрытие, навигация ---------- */

  let openerIndex = 0;

  function openAt(i, opener) {
    openerIndex = i;
    lbHint.style.animation = 'none';
    void lbHint.offsetWidth;
    lbHint.style.animation = '';
    lbHint.style.opacity = '';
    lbHint.textContent = matchMedia('(hover: none)').matches
      ? 'двойное касание или щипок — приблизить'
      : 'колесо мыши или двойной клик — приблизить';

    lb.hidden = false;
    document.documentElement.classList.add('lb-open');
    show(i);
    btnClose.focus({ preventScroll: true });
    try { history.pushState({ lb: true }, ''); } catch (e) { /* ignore */ }
  }

  function closeLb(fromPop) {
    if (lb.hidden) return;
    lb.hidden = true;
    document.documentElement.classList.remove('lb-open');
    lbImg.removeAttribute('src');
    if (!fromPop) {
      try { if (history.state && history.state.lb) history.back(); } catch (e) { /* ignore */ }
    }
    if (index !== openerIndex && slides[index]) {
      slides[index].scrollIntoView({ block: 'center' });
    }
    if (buttons[index]) buttons[index].focus({ preventScroll: true });
  }

  function show(i) {
    if (i < 0 || i >= photos.length) return;
    index = i;
    resetTransform();
    lbImg.src = photos[i];
    lbImg.alt = 'Скуратовский котик, фото ' + (i + 1);
    lbCount.textContent = (i + 1) + ' / ' + photos.length;
    btnPrev.disabled = i === 0;
    btnNext.disabled = i === photos.length - 1;
    [i - 1, i + 1].forEach(j => {
      if (photos[j]) { const pre = new Image(); pre.src = photos[j]; }
    });
  }

  btnClose.addEventListener('click', () => closeLb(false));
  btnPrev.addEventListener('click', () => show(index - 1));
  btnNext.addEventListener('click', () => show(index + 1));
  window.addEventListener('popstate', () => closeLb(true));

  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    switch (e.key) {
      case 'Escape': closeLb(false); break;
      case 'ArrowLeft': show(index - 1); break;
      case 'ArrowRight': show(index + 1); break;
      case '+': case '=': zoomAtCenter(scale * 1.4); break;
      case '-': zoomAtCenter(scale / 1.4); break;
      case '0': resetTransform(true); break;
      default: return;
    }
    e.preventDefault();
  });

  /* ---------- Масштабирование и перемещение ---------- */

  let scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let gesture = null;
  let lastDist = 0;
  let lastMid = { x: 0, y: 0 };
  let lastTap = 0;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function apply(animated) {
    lbImg.style.transition = animated ? 'transform .22s ease' : 'none';
    lbImg.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
  }

  function clampPan() {
    const maxX = Math.max(0, (lbImg.clientWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (lbImg.clientHeight * scale - stage.clientHeight) / 2);
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
  }

  function resetTransform(animated) {
    scale = 1; tx = 0; ty = 0;
    apply(animated);
  }

  function zoomAt(cx, cy, next, animated) {
    next = clamp(next, 1, MAX_SCALE);
    const r = stage.getBoundingClientRect();
    const px = cx - (r.left + r.width / 2);
    const py = cy - (r.top + r.height / 2);
    const k = next / scale;
    tx = px - k * (px - tx);
    ty = py - k * (py - ty);
    scale = next;
    clampPan();
    apply(animated);
  }

  function zoomAtCenter(next) {
    const r = stage.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, next, true);
  }

  function pair() {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    };
  }

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, scale * Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });

  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      gesture = { x0: e.clientX, y0: e.clientY, moved: 0, multi: false };
    } else {
      gesture.multi = true;
      const p = pair();
      lastDist = p.dist;
      lastMid = p.mid;
    }
  });

  stage.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p || !gesture) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    gesture.moved = Math.max(gesture.moved, Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0));

    if (pointers.size >= 2) {
      const cur = pair();
      zoomAt(cur.mid.x, cur.mid.y, scale * cur.dist / lastDist);
      tx += cur.mid.x - lastMid.x;
      ty += cur.mid.y - lastMid.y;
      clampPan();
      apply();
      lastDist = cur.dist;
      lastMid = cur.mid;
    } else if (scale > 1) {
      tx += dx;
      ty += dy;
      clampPan();
      apply();
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size > 0 || !gesture) return;

    const g = gesture;
    gesture = null;

    if (g.multi) {
      if (scale < 1.02) resetTransform(true);
      return;
    }
    if (e.type === 'pointercancel') return;

    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;

    if (g.moved < 10) {                       // касание
      const now = performance.now();
      if (now - lastTap < 300) {
        lastTap = 0;
        if (scale > 1.05) resetTransform(true);
        else zoomAt(e.clientX, e.clientY, DOUBLE_TAP_SCALE, true);
      } else {
        lastTap = now;
      }
      return;
    }

    if (scale === 1) {                        // свайпы без увеличения
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
      else if (dy > 100 && Math.abs(dy) > Math.abs(dx)) closeLb(false);
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  load();
})();
