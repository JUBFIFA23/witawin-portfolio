/* =========================================================
   Project MU — main.js
   ลูกเล่นทั้งหมดของหน้าเว็บ เขียนด้วย JavaScript ล้วน ไม่ใช้ไลบรารี
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const html = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  };

  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // เรียก callback ครั้งเดียวเมื่อ element เลื่อนเข้ามาในจอ
  function onVisible(el, cb, threshold = 0.3) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { cb(el); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); cb(el); }
    }, { threshold });
    io.observe(el);
  }

  // รวมงานที่ต้องทำตอน scroll/resize ไว้ใน requestAnimationFrame เดียว
  const scrollTasks = [];
  let scrollQueued = false;
  function queueScrollTasks() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      scrollTasks.forEach((fn) => fn());
    });
  }
  addEventListener('scroll', queueScrollTasks, { passive: true });
  addEventListener('resize', queueScrollTasks);

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 2800);
  }

  /* ---------- Preloader ---------- */
  function runPreloader() {
    const el = $('#preloader');
    if (!el) return Promise.resolve();
    const out = $('#preloaderOut');
    const bar = $('#preloaderBar');
    const lines = [
      '$ ssh witawin@mu-ict',
      '> loading profile ......... ok',
      '> compiling journey ....... ok',
      '> mounting projects ....... ok',
      '> ready. welcome ✦',
    ];
    const total = lines.join('').length;

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        bar.style.width = '100%';
        setTimeout(() => {
          el.classList.add('is-done');
          document.body.classList.remove('is-loading');
          resolve();
          setTimeout(() => el.remove(), 1000);
        }, reduceMotion ? 0 : 220);
      };

      el.addEventListener('click', finish);
      addEventListener('keydown', finish, { once: true });
      setTimeout(finish, 4500); // กันค้าง
      if (reduceMotion) { finish(); return; }

      let line = 0;
      let char = 0;
      let typed = 0;
      const tick = () => {
        if (done) return;
        if (line >= lines.length) { setTimeout(finish, 180); return; }
        char += 1;
        typed += 1;
        out.textContent = lines.slice(0, line).concat(lines[line].slice(0, char)).join('\n');
        bar.style.width = `${(typed / total) * 100}%`;
        if (char >= lines[line].length) {
          line += 1;
          char = 0;
          setTimeout(tick, 110);
        } else {
          setTimeout(tick, 9);
        }
      };
      tick();
    });
  }

  /* ---------- Theme (สลับสว่าง/มืด แบบวงกลมขยาย) ---------- */
  function applyTheme(theme) {
    html.dataset.theme = theme;
    store.set('theme', theme);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f4f6fc' : '#060a17';
  }

  function toggleTheme(originEl) {
    const next = html.dataset.theme === 'light' ? 'dark' : 'light';
    if (!document.startViewTransition || reduceMotion) { applyTheme(next); return next; }

    const r = (originEl || $('#themeToggle')).getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => applyTheme(next));
    transition.ready.then(() => {
      html.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {});
    return next;
  }

  function initTheme() {
    const btn = $('#themeToggle');
    if (btn) btn.addEventListener('click', () => toggleTheme(btn));
  }

  /* ---------- Navigation ---------- */
  function initNav() {
    const nav = $('#nav');
    const menu = $('#navLinks');
    const burger = $('#burger');
    const pill = $('.nav__pill');
    const links = $$('a', menu);
    const termLink = $('.nav__term');
    // section Terminal ไม่อยู่ในเมนูหลัก แต่ไฮไลต์ปุ่ม Terminal ด้านขวาแทน
    const sections = links.map((a) => $(a.getAttribute('href')))
      .concat($('#playground'))
      .filter(Boolean)
      .sort((a, b) => a.offsetTop - b.offsetTop);
    let current = null;

    const movePill = () => {
      const active = links.find((a) => a.classList.contains('is-active'));
      if (!active || !pill) { if (pill) pill.style.opacity = '0'; return; }
      pill.style.opacity = '1';
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
    };

    const setActive = (id) => {
      if (id === current) return;
      current = id;
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
      if (termLink) termLink.classList.toggle('is-active', id === 'playground');
      movePill();
    };

    scrollTasks.push(() => {
      nav.classList.toggle('is-scrolled', scrollY > 20);
      const probe = scrollY + innerHeight * 0.35;
      let id = null;
      sections.forEach((s) => { if (s.offsetTop <= probe) id = s.id; });
      // ถ้าเลื่อนผ่าน section สุดท้ายไปแล้วไม่ต้องไฮไลต์
      const last = sections[sections.length - 1];
      if (last && scrollY > last.offsetTop + last.offsetHeight) id = null;
      setActive(id);
    });
    addEventListener('resize', movePill);

    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    links.forEach((a) => a.addEventListener('click', () => setOpen(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }

  /* ---------- Scroll progress + ปุ่มกลับด้านบน ---------- */
  function initProgress() {
    const bar = $('#scrollProgress');
    const toTop = $('#toTop');
    const ring = toTop && $('circle', toTop);
    const circumference = 2 * Math.PI * 24;

    scrollTasks.push(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
      bar.style.transform = `scaleX(${p})`;
      if (toTop) {
        toTop.classList.toggle('is-visible', scrollY > 600);
        ring.style.strokeDashoffset = String(circumference * (1 - p));
      }
    });
    if (toTop) toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    const els = $$('.reveal');
    // ไล่ดีเลย์ให้ element พี่น้องโผล่ขึ้นมาทีละตัว
    els.forEach((el) => {
      if (el.style.getPropertyValue('--d')) return;
      const siblings = Array.from(el.parentElement.children).filter((c) => c.classList.contains('reveal'));
      el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 6) * 0.08}s`);
    });

    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Typewriter ---------- */
  function initTyped() {
    const el = $('#typed');
    if (!el || reduceMotion) return;
    const words = ['Self-taught Developer', 'React & Tailwind Builder', 'C++ Competitor', 'micro:bit Maker', 'Future DST @ ICT Mahidol'];
    let w = 0;
    let c = words[0].length;
    let deleting = true;

    const loop = () => {
      const word = words[w];
      c += deleting ? -1 : 1;
      el.textContent = word.slice(0, c);
      let delay = deleting ? 35 : 70;
      if (!deleting && c === word.length) { deleting = true; delay = 1800; }
      else if (deleting && c === 0) { deleting = false; w = (w + 1) % words.length; delay = 300; }
      setTimeout(loop, delay);
    };
    setTimeout(loop, 1800);
  }

  /* ---------- Scramble text (หัวข้อภาษาอังกฤษเล็ก ๆ) ---------- */
  function scramble(el) {
    const finalText = el.textContent;
    const glyphs = '!<>-_\\/[]{}=+*^?#01';
    const frames = 26;
    let frame = 0;
    const tick = () => {
      const progress = frame / frames;
      el.textContent = finalText.split('').map((ch, i) => {
        if (ch === ' ' || i / finalText.length < progress) return ch;
        return glyphs[(Math.random() * glyphs.length) | 0];
      }).join('');
      frame += 1;
      if (frame <= frames) requestAnimationFrame(tick);
      else el.textContent = finalText;
    };
    tick();
  }

  function initScramble() {
    if (reduceMotion) return;
    $$('[data-scramble]').forEach((el) => onVisible(el, scramble, 0.8));
  }

  /* ---------- Counters ---------- */
  function animateCounter(el) {
    const to = parseFloat(el.dataset.to);
    const decimals = Number(el.dataset.decimals) || 0;
    if (reduceMotion) { el.textContent = to.toFixed(decimals); return; }
    const duration = 1800;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = (to * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function initCounters() {
    $$('.counter').forEach((el) => onVisible(el, animateCounter, 0.6));
  }

  /* ---------- Cursor ring ---------- */
  function initCursor() {
    const ring = $('#cursorRing');
    if (!ring || !finePointer || reduceMotion) return;
    html.classList.add('has-cursor');
    let x = -100;
    let y = -100;
    let rx = x;
    let ry = y;

    addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
    const loop = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      ring.style.translate = `${rx}px ${ry}px`;
      requestAnimationFrame(loop);
    };
    loop();

    document.addEventListener('pointerover', (e) => {
      const target = e.target.closest('a, button, input, .mb__led, [data-tilt]');
      ring.classList.toggle('is-hover', Boolean(target));
    });
    document.addEventListener('pointerdown', () => ring.classList.add('is-down'));
    document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
    document.documentElement.addEventListener('pointerleave', () => ring.classList.add('is-hidden'));
    document.documentElement.addEventListener('pointerenter', () => ring.classList.remove('is-hidden'));
  }

  /* ---------- Magnetic buttons / 3D tilt / Spotlight ---------- */
  function initPointerFX() {
    if (!finePointer || reduceMotion) return;

    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.translate = `${dx * 0.22}px ${dy * 0.32}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });

    $$('[data-tilt]').forEach((el) => {
      const max = Number(el.dataset.tilt) || 8;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });

    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest('.spot');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---------- Background: particle network ---------- */
  function initParticles() {
    const canvas = $('#bgCanvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let dpr = 1;
    let points = [];
    const mouse = { x: -9999, y: -9999 };

    let lastWidth = 0;
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.width = Math.round(innerWidth * dpr);
      h = canvas.height = Math.round(innerHeight * dpr);
      // บนมือถือ แถบ URL ยืด/หดตอนเลื่อนจะทำให้ความสูงเปลี่ยน ไม่ต้องสุ่มจุดใหม่
      if (innerWidth === lastWidth && points.length) return;
      lastWidth = innerWidth;
      const count = Math.round(clamp((innerWidth * innerHeight) / 17000, 24, 90));
      points = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3 * dpr,
        vy: (Math.random() - 0.5) * 0.3 * dpr,
        r: (Math.random() * 1.3 + 0.6) * dpr,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const rgb = html.dataset.theme === 'light' ? '36, 87, 214' : '130, 175, 255';
      const linkDist = 130 * dpr;
      const mx = mouse.x * dpr;
      const my = mouse.y * dpr;

      points.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const dx = p.x - mx;
        const dy = p.y - my;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 120 * dpr) { p.x += (dx / d) * 1.4; p.y += (dy / d) * 1.4; }
      });

      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i];
          const b = points[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < linkDist) {
            ctx.strokeStyle = `rgba(${rgb}, ${(1 - d / linkDist) * 0.28})`;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = `rgba(${rgb}, .7)`;
      points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    let running = false;
    const loop = () => {
      if (!running) return;
      draw();
      requestAnimationFrame(loop);
    };
    const start = () => { if (!running && !reduceMotion) { running = true; loop(); } };
    const stop = () => { running = false; };

    resize();
    addEventListener('resize', () => { resize(); if (reduceMotion) draw(); });
    addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    if (reduceMotion) draw(); else start();
  }

  /* ---------- Marquee (ทำสำเนาให้วิ่งวนไม่สะดุด) ---------- */
  function initMarquee() {
    const track = $('.marquee__track');
    if (!track) return;
    Array.from(track.children).forEach((node) => track.appendChild(node.cloneNode(true)));
  }

  /* ---------- Timeline: เส้นเติมตามการเลื่อน ---------- */
  function initTimeline() {
    const tl = $('#timeline');
    if (!tl) return;
    const items = $$('.tl-item', tl);
    scrollTasks.push(() => {
      const r = tl.getBoundingClientRect();
      const trigger = innerHeight * 0.6;
      const p = clamp((trigger - r.top) / r.height, 0, 1);
      tl.style.setProperty('--fill', `${p * 100}%`);
      items.forEach((it) => {
        const dot = it.querySelector('.tl-item__dot');
        it.classList.toggle('is-active', dot.getBoundingClientRect().top < trigger);
      });
    });
  }

  /* ---------- Live demo: ตารางคะแนน eFootball ---------- */
  function initLeague() {
    const matchesEl = $('#lgMatches');
    const bodyEl = $('#lgBody');
    const statusEl = $('#lgStatus');
    if (!matchesEl || !bodyEl) return;

    const TEAMS = [
      { id: 'sal', name: 'Salaya FC', color: '#5b8cff' },
      { id: 'pyt', name: 'Phayathai Utd', color: '#f0c35a' },
      { id: 'bkn', name: 'Bangkok Noi', color: '#38e1ff' },
      { id: 'kan', name: 'Kanchanaburi', color: '#ff8fa3' },
    ];
    const team = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
    const FIXTURES = [['sal', 'pyt'], ['bkn', 'kan'], ['sal', 'bkn'], ['pyt', 'kan'], ['kan', 'sal'], ['pyt', 'bkn']];
    let scores = [[2, 1], [1, 1], [0, 2], [null, null], [null, null], [null, null]];

    const crest = (t) => `<i class="crest" style="--c:${t.color}">${t.name.charAt(0)}</i>`;

    matchesEl.innerHTML = FIXTURES.map(([h, a], i) => `
      <div class="match">
        <span class="match__team match__team--home">${team[h].name}${crest(team[h])}</span>
        <input class="match__score" type="number" inputmode="numeric" min="0" max="20" placeholder="–"
          data-i="${i}" data-side="0" aria-label="ประตูของ ${team[h].name} นัดที่ ${i + 1}">
        <span class="match__vs">:</span>
        <input class="match__score" type="number" inputmode="numeric" min="0" max="20" placeholder="–"
          data-i="${i}" data-side="1" aria-label="ประตูของ ${team[a].name} นัดที่ ${i + 1}">
        <span class="match__team">${crest(team[a])}${team[a].name}</span>
      </div>`).join('');

    const inputs = $$('.match__score', matchesEl);
    const syncInputs = () => inputs.forEach((inp) => {
      const v = scores[inp.dataset.i][inp.dataset.side];
      inp.value = v == null ? '' : v;
    });

    const rows = new Map();
    TEAMS.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'lg-row';
      row.setAttribute('role', 'row');
      row.innerHTML = `<span class="c-pos"></span><span class="c-team">${crest(t)}<b>${t.name}</b></span>`
        + '<span class="c-p"></span><span class="c-w"></span><span class="c-d"></span><span class="c-l"></span>'
        + '<span class="c-gd"></span><span class="c-pts"></span>';
      rows.set(t.id, row);
      bodyEl.appendChild(row);
    });

    const compute = () => {
      const table = Object.fromEntries(TEAMS.map((t) => [t.id, { ...t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
      FIXTURES.forEach(([h, a], i) => {
        const [hg, ag] = scores[i];
        if (hg == null || ag == null) return;
        const H = table[h];
        const A = table[a];
        H.p += 1; A.p += 1;
        H.gf += hg; H.ga += ag;
        A.gf += ag; A.ga += hg;
        if (hg > ag) { H.w += 1; A.l += 1; H.pts += 3; }
        else if (hg < ag) { A.w += 1; H.l += 1; A.pts += 3; }
        else { H.d += 1; A.d += 1; H.pts += 1; A.pts += 1; }
      });
      // เรียงตาม: แต้ม > ผลต่างประตู > ประตูได้ > ชื่อทีม
      return Object.values(table).sort((x, y) => (
        y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name)
      ));
    };

    const prevRank = {};
    const render = (animate) => {
      const first = new Map();
      rows.forEach((row, id) => first.set(id, row.getBoundingClientRect().top));

      compute().forEach((t, idx) => {
        const row = rows.get(t.id);
        bodyEl.appendChild(row);
        const gd = t.gf - t.ga;
        const set = (sel, value) => {
          const cell = row.querySelector(sel);
          const text = String(value);
          if (cell.textContent === text) return;
          cell.textContent = text;
          if (animate && !reduceMotion) {
            cell.classList.remove('bump');
            void cell.offsetWidth;
            cell.classList.add('bump');
          }
        };
        set('.c-pos', idx + 1);
        set('.c-p', t.p);
        set('.c-w', t.w);
        set('.c-d', t.d);
        set('.c-l', t.l);
        set('.c-gd', gd > 0 ? `+${gd}` : gd);
        set('.c-pts', t.pts);
        row.classList.toggle('is-leader', idx === 0 && t.p > 0);

        if (animate && prevRank[t.id] != null && prevRank[t.id] !== idx) {
          row.classList.remove('is-up', 'is-down');
          void row.offsetWidth;
          row.classList.add(idx < prevRank[t.id] ? 'is-up' : 'is-down');
        }
        prevRank[t.id] = idx;
      });

      // FLIP: ให้แถวเลื่อนขึ้น/ลงอย่างนุ่มนวลเมื่ออันดับเปลี่ยน
      if (animate && !reduceMotion) {
        rows.forEach((row, id) => {
          const dy = first.get(id) - row.getBoundingClientRect().top;
          if (Math.abs(dy) > 1) {
            row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
              { duration: 600, easing: 'cubic-bezier(.2,.75,.2,1)' });
          }
        });
      }

      const played = scores.filter(([a, b]) => a != null && b != null).length;
      statusEl.textContent = `บันทึกผลแล้ว ${played}/${FIXTURES.length} นัด`;
    };

    matchesEl.addEventListener('input', (e) => {
      const inp = e.target.closest('.match__score');
      if (!inp) return;
      let v = inp.value.trim() === '' ? null : Math.floor(Number(inp.value));
      if (v != null && (Number.isNaN(v) || v < 0)) { v = 0; inp.value = '0'; }
      if (v != null && v > 20) { v = 20; inp.value = '20'; }
      scores[inp.dataset.i][inp.dataset.side] = v;
      render(true);
    });

    const randomGoals = () => Math.floor(Math.random() ** 1.7 * 5);
    $('#lgRandom').addEventListener('click', () => {
      scores = FIXTURES.map(() => [randomGoals(), randomGoals()]);
      syncInputs();
      render(true);
      toast('🎲 สุ่มผลครบทุกนัดแล้ว ตารางจัดอันดับใหม่ให้อัตโนมัติ');
    });
    $('#lgReset').addEventListener('click', () => {
      scores = FIXTURES.map(() => [null, null]);
      syncInputs();
      render(true);
    });

    syncInputs();
    render(false);
  }

  /* ---------- micro:bit simulator ---------- */
  function initMicrobit() {
    const wrap = $('#microbit');
    if (!wrap) return;
    const ledsEl = $('#mbLeds');
    const codeEl = $('#mbCode');
    const lampState = $('#mbLampState');
    const servoState = $('#mbServoState');

    const ICONS = {
      heart: '0101011111111110111000100',
      small: '0000001010011100010000000',
      sun: '1010101110111110111010101',
      moon: '0011101100011000110000111',
      right: '0010000010111110001000100',
      left: '0010001000111110100000100',
    };

    const leds = Array.from({ length: 25 }, (_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mb__led';
      b.dataset.x = String(i % 5);
      b.dataset.y = String(Math.floor(i / 5));
      b.setAttribute('aria-label', `LED แถว ${Math.floor(i / 5) + 1} คอลัมน์ ${(i % 5) + 1}`);
      ledsEl.appendChild(b);
      return b;
    });
    const show = (pattern) => leds.forEach((led, i) => led.classList.toggle('on', pattern[i] === '1'));

    let idle = true;
    let beat = false;
    let light = false;
    let angle = 0;

    show(ICONS.heart);
    if (!reduceMotion) {
      setInterval(() => {
        if (!idle) return;
        beat = !beat;
        show(beat ? ICONS.small : ICONS.heart);
      }, 650);
    }

    const setCode = (text) => {
      codeEl.textContent = text;
      codeEl.classList.remove('flash');
      void codeEl.offsetWidth;
      codeEl.classList.add('flash');
    };

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.mb__btn');
      if (btn) {
        idle = false;
        btn.classList.add('is-pressed');
        setTimeout(() => btn.classList.remove('is-pressed'), 140);

        if (btn.dataset.btn === 'A') {
          light = !light;
          wrap.classList.toggle('is-light', light);
          show(light ? ICONS.sun : ICONS.moon);
          lampState.textContent = light ? 'เปิด' : 'ปิด';
          setCode(light ? 'pin0.write_digital(1)  # เปิดไฟห้อง' : 'pin0.write_digital(0)  # ปิดไฟห้อง');
        } else {
          angle = angle ? 0 : 90;
          wrap.style.setProperty('--deg', `${-angle}deg`);
          show(angle ? ICONS.right : ICONS.left);
          servoState.textContent = `${angle}°`;
          setCode(`pin1.write_analog(${angle ? 77 : 26})  # เซอร์โว ${angle}°`);
        }
        return;
      }

      const led = e.target.closest('.mb__led');
      if (led) {
        idle = false;
        const on = led.classList.toggle('on');
        setCode(`display.set_pixel(${led.dataset.x}, ${led.dataset.y}, ${on ? 9 : 0})  # วาดเอง!`);
      }
    });
  }

  /* ---------- Interactive terminal ---------- */
  function initTerminal() {
    const out = $('#termOut');
    const body = $('#termBody');
    const form = $('#termForm');
    const input = $('#termInput');
    if (!form) return;

    const span = (cls, text) => `<span class="${cls}">${text}</span>`;
    const PROMPT = `${span('t-user', 'witawin@mu-ict')}:${span('t-path', '~')}$ `;
    const ASCII = String.raw`
 __  __ _   _     ___ ____ _____
|  \/  | | | |   |_ _/ ___|_   _|
| |\/| | | | |    | | |     | |
| |  | | |_| |    | | |___  | |
|_|  |_|\___/    |___\____| |_|`;

    const bar = (value) => {
      const filled = Math.round((value / 4) * 20);
      return span('t-cyan', '█'.repeat(filled)) + span('t-muted', '░'.repeat(20 - filled));
    };

    const FILES = {
      'about.txt': 'about',
      'journey.md': 'journey',
      'skills.json': 'skills',
      'grades.csv': 'grades',
      'why-mu.md': 'why-mu',
      'goal.md': 'goal',
    };

    const commands = {
      help: {
        desc: 'ดูคำสั่งทั้งหมด',
        run: () => [
          span('t-gold', 'คำสั่งที่ใช้ได้:'),
          ...Object.entries(commands)
            .filter(([, c]) => c.desc)
            .map(([name, c]) => `  ${span('t-cyan', name.padEnd(10))} ${c.desc}`),
          '',
          span('t-muted', 'เคล็ดลับ: กด Tab เพื่อเติมคำสั่ง, ↑ ↓ เพื่อเรียกคำสั่งเดิม'),
        ],
      },
      whoami: {
        desc: 'ผมคือใคร',
        run: () => [
          span('t-white', 'วิธวินท์ แก้วโหมดตาด') + span('t-muted', ' (Witawin Kaewmodtad)'),
          'นักเรียน ปวช. สาขาเทคโนโลยีธุรกิจดิจิทัล · Self-taught developer',
          `เป้าหมาย: ${span('t-gold', 'วท.บ. วิทยาการและเทคโนโลยีดิจิทัล @ ICT Mahidol')}`,
        ],
      },
      about: {
        desc: 'เรื่องราวโดยย่อ',
        run: () => [
          `${span('t-gold', '›')} ไม่มีคอมพิวเตอร์ที่บ้าน เลยเริ่มเขียน Scratch ที่ห้องคอมของโรงเรียน`,
          `${span('t-gold', '›')} ม.3 เขียน Python ครั้งแรก + ทำห้องนอนอัจฉริยะด้วย micro:bit`,
          `${span('t-gold', '›')} ปวช. เรียนเขียนโปรแกรมเพิ่มเองนอกห้องเรียน`,
          `${span('t-gold', '›')} ตัวแทนวิทยาลัยแข่ง C++ ระดับภูมิภาค`,
          `${span('t-gold', '›')} ตอนนี้กำลังสร้าง eFootball Tournament Manager`,
        ],
      },
      journey: {
        desc: 'เส้นทางการเรียนรู้',
        run: () => [
          `${span('t-cyan', 'Scratch')} → ${span('t-cyan', 'Python + micro:bit')} → ${span('t-cyan', 'C++ / Web')} → ${span('t-cyan', 'React')} → ${span('t-gold', 'ICT Mahidol')}`,
        ],
      },
      skills: {
        desc: 'ภาษาและเครื่องมือ',
        run: () => [
          `${span('t-gold', 'languages ')}  C++ · Python · JavaScript · HTML · CSS`,
          `${span('t-gold', 'frameworks')}  React · Tailwind CSS`,
          `${span('t-gold', 'hardware  ')}  micro:bit`,
          `${span('t-gold', 'first love')}  Scratch ♥`,
          `${span('t-gold', 'background')}  Digital Business Technology (ปวช.)`,
        ],
      },
      projects: {
        desc: 'ผลงาน',
        run: () => [
          `${span('t-cyan', '[1]')} ${span('t-white', 'eFootball Tournament Manager')}  ${span('t-green', '● กำลังพัฒนา')}`,
          '    React · Tailwind CSS · Full-stack · คำนวณตารางคะแนนอัตโนมัติ',
          `${span('t-cyan', '[2]')} ${span('t-white', 'Smart Bedroom')}`,
          '    Python · micro:bit · ควบคุมอุปกรณ์ไฟฟ้าในห้อง',
          `${span('t-cyan', '[3]')} ${span('t-white', 'C++ Programming Contest')}`,
          '    ตัวแทนวิทยาลัย · ระดับภูมิภาค · E-TECH ชลบุรี',
          '',
          span('t-muted', '→ ลองเล่นเดโมของแต่ละโปรเจกต์ได้ที่ส่วน "ผลงาน" ด้านบน'),
        ],
      },
      grades: {
        desc: 'ผลการเรียน',
        run: () => [
          `${span('t-gold', 'GPAX 3.66')} ${span('t-muted', '(4 ภาคเรียน)')}`,
          `${bar(4)} 4.00  กลุ่มภาษาต่างประเทศ`,
          `${bar(4)} 4.00  ภาษาอังกฤษ`,
          `${bar(3.75)} 3.75  กลุ่มวิทยาศาสตร์`,
          `${bar(3.5)} 3.50  กลุ่มคณิตศาสตร์`,
          `${bar(3.33)} 3.33  กลุ่มภาษาไทย`,
          `${bar(3.33)} 3.33  กลุ่มสังคมศึกษาฯ`,
        ],
      },
      'why-mu': {
        desc: 'ทำไมต้อง ICT มหิดล',
        run: () => [
          'เพราะสิ่งที่เรียนเองยังขาด "รากฐานทางทฤษฎี":',
          `  ${span('t-cyan', '◆')} โครงสร้างข้อมูลและอัลกอริทึม`,
          `  ${span('t-cyan', '◆')} สถาปัตยกรรมซอฟต์แวร์`,
          `  ${span('t-cyan', '◆')} การออกแบบระบบฐานข้อมูล`,
          'และหลักสูตร DST ผสาน CS เข้ากับธุรกิจและสังคมดิจิทัล',
          `ซึ่งตรงกับพื้นฐาน ${span('t-gold', 'เทคโนโลยีธุรกิจดิจิทัล')} ที่ผมมีอยู่แล้ว`,
        ],
      },
      goal: {
        desc: 'เป้าหมายในอนาคต',
        run: () => [
          'สร้างซอฟต์แวร์ให้ผู้ประกอบการรายย่อยและวิสาหกิจชุมชน',
          `  ${span('t-green', '✔')} ระบบจัดการสินค้าคงคลังและบันทึกยอดขาย`,
          `  ${span('t-green', '✔')} ระบบสั่งซื้อออนไลน์ขนาดเล็กสำหรับร้านค้าท้องถิ่น`,
          `${span('t-gold', 'ธุรกิจดิจิทัล + การเขียนโปรแกรม = ซอฟต์แวร์เพื่อสังคมไทย')}`,
        ],
      },
      theme: {
        desc: 'สลับธีมสว่าง/มืด',
        run: () => [`theme → ${span('t-gold', toggleTheme(input))}`],
      },
      ls: {
        desc: 'ดูรายการไฟล์',
        run: () => [
          `${Object.keys(FILES).map((f) => span('t-white', f)).join('  ')}  ${span('t-cyan', 'projects/')}`,
        ],
      },
      cat: {
        desc: 'เปิดอ่านไฟล์ เช่น cat about.txt',
        run: (args) => {
          const file = args[0];
          if (!file) return [span('t-red', 'cat: ต้องระบุชื่อไฟล์ เช่น cat about.txt')];
          if (FILES[file]) return commands[FILES[file]].run([]);
          if (file.replace(/\/$/, '') === 'projects') return [span('t-red', `cat: ${escapeHTML(file)}: Is a directory`), 'ลองพิมพ์ projects แทนครับ'];
          return [span('t-red', `cat: ${escapeHTML(file)}: No such file`)];
        },
      },
      date: {
        desc: 'วันและเวลาปัจจุบัน',
        run: () => [new Date().toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'short' })],
      },
      echo: { run: (args) => [escapeHTML(args.join(' '))] },
      history: { run: () => history.map((h, i) => `${span('t-muted', String(i + 1).padStart(3))}  ${escapeHTML(h)}`) },
      sudo: {
        run: () => {
          setTimeout(confetti, 900);
          return [
            `[sudo] password for committee: ${span('t-muted', '********')}`,
            `${span('t-green', '✔')} ส่งคำขอถึงคณะกรรมการ ICT Mahidol แล้ว`,
            `${span('t-gold', '⏳')} สถานะ: รอการพิจารณา`,
            'ขอบคุณที่แวะมาชมพอร์ตโฟลิโอนี้ครับ 🙏',
          ];
        },
      },
      hello: { run: () => ['สวัสดีครับ! 👋 ยินดีที่ได้รู้จัก ลองพิมพ์ ' + span('t-cyan', 'whoami') + ' ดูสิครับ'] },
      exit: { run: () => ['ยังออกไม่ได้นะครับ ยังมีอะไรให้ดูอีกเยอะ 😄'] },
      rm: { run: () => [span('t-red', 'rm: Permission denied') + ' — ใจเย็น ๆ ครับ 😅'] },
    };
    commands.hi = commands.hello;
    commands['สวัสดี'] = commands.hello;

    const history = [];
    let historyIndex = 0;
    let queue = Promise.resolve();

    const print = (lines, delay = 22) => lines.reduce((p, line) => p.then(() => new Promise((resolve) => {
      const div = document.createElement('div');
      div.className = 't-line';
      div.innerHTML = line;
      out.appendChild(div);
      body.scrollTop = body.scrollHeight;
      setTimeout(resolve, reduceMotion ? 0 : delay);
    })), Promise.resolve());

    const enqueue = (fn) => { queue = queue.then(fn); };

    let welcomed = false;
    const welcome = () => {
      if (welcomed) return;
      welcomed = true;
      enqueue(() => print([
        `<span class="t-ascii">${escapeHTML(ASCII.slice(1))}</span>`,
        '',
        `ยินดีต้อนรับสู่ terminal ของ ${span('t-gold', 'Witawin')} ✦`,
        `พิมพ์ ${span('t-cyan', 'help')} เพื่อเริ่มต้น`,
        '',
      ], 60));
    };

    const run = (raw) => {
      welcome();
      const line = raw.trim();
      enqueue(() => print([PROMPT + escapeHTML(line)], 0));
      if (!line) return;
      history.push(line);
      historyIndex = history.length;

      const [name, ...args] = line.split(/\s+/);
      const key = name.toLowerCase();
      if (key === 'clear') { enqueue(() => { out.innerHTML = ''; }); return; }
      const cmd = commands[key];
      const result = cmd
        ? cmd.run(args)
        : [`${span('t-red', `command not found: ${escapeHTML(name)}`)} — พิมพ์ ${span('t-cyan', 'help')} เพื่อดูคำสั่งทั้งหมด`];
      enqueue(() => print([...result, '']));
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      run(input.value);
      input.value = '';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' && history.length) {
        e.preventDefault();
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex];
      } else if (e.key === 'ArrowDown' && history.length) {
        e.preventDefault();
        historyIndex = Math.min(history.length, historyIndex + 1);
        input.value = history[historyIndex] || '';
      } else if (e.key === 'Tab' && input.value.trim()) {
        e.preventDefault();
        const partial = input.value.trim().toLowerCase();
        const matches = Object.keys(commands).filter((c) => c.startsWith(partial));
        if (matches.length === 1) input.value = `${matches[0]} `;
        else if (matches.length > 1) enqueue(() => print([PROMPT + escapeHTML(input.value), matches.join('  '), '']));
      }
    });

    // คลิกตรงไหนใน terminal ก็พิมพ์ต่อได้เลย (ยกเว้นตอนลากเลือกข้อความ)
    body.addEventListener('click', () => {
      if (!String(getSelection())) input.focus({ preventScroll: true });
    });

    $('#termChips').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cmd]');
      if (!btn) return;
      run(btn.dataset.cmd);
      if (finePointer) input.focus({ preventScroll: true });
    });

    onVisible(body, welcome, 0.4);
  }

  /* ---------- Skills filter ---------- */
  function initSkills() {
    const buttons = $$('.filters button');
    const cards = $$('#skillGrid .skill');
    buttons.forEach((btn) => btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      const filter = btn.dataset.filter;
      let i = 0;
      cards.forEach((card) => {
        const show = filter === 'all' || card.dataset.cat.split(' ').includes(filter);
        card.hidden = !show;
        if (!show) return;
        card.classList.remove('pop');
        void card.offsetWidth;
        card.style.animationDelay = `${i * 0.05}s`;
        card.classList.add('pop');
        i += 1;
      });
    }));
  }

  /* ---------- GPAX ring ---------- */
  function initGrades() {
    const ring = $('#gpaxRing');
    if (!ring) return;
    const circumference = 2 * Math.PI * Number(ring.getAttribute('r'));
    const ratio = Number(ring.dataset.value) / Number(ring.dataset.max);
    ring.style.strokeDasharray = String(circumference);
    ring.style.strokeDashoffset = String(circumference);
    onVisible(ring.closest('.gpax'), () => {
      ring.style.strokeDashoffset = String(circumference * (1 - ratio));
    }, 0.4);
  }

  /* ---------- Quote: คำค่อย ๆ สว่างขึ้นตามการเลื่อน ---------- */
  function initQuote() {
    const quote = $('#quote');
    if (!quote || reduceMotion) return;
    const text = quote.textContent.trim();
    // ภาษาไทยไม่มีเว้นวรรคระหว่างคำ จึงใช้ Intl.Segmenter ตัดคำ
    const parts = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(text), (s) => s.segment)
      : text.split(/(\s+)/);
    quote.innerHTML = parts.map((p) => (/^\s+$/.test(p) ? p : `<span class="w">${escapeHTML(p)}</span>`)).join('');
    const words = $$('.w', quote);

    scrollTasks.push(() => {
      const r = quote.getBoundingClientRect();
      const p = clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.3), 0, 1);
      const lit = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
    });
  }

  /* ---------- Konami code + Confetti ---------- */
  let confettiRunning = false;
  function confetti() {
    const canvas = $('#confetti');
    if (!canvas || reduceMotion || confettiRunning) return;
    confettiRunning = true;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.hidden = false;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ['#5b8cff', '#38e1ff', '#f0c35a', '#ffffff', '#ff8fa3', '#34d399'];
    const pieces = Array.from({ length: 180 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 240,
      y: innerHeight * 0.7,
      vx: (Math.random() - 0.5) * 18,
      vy: -(Math.random() * 15 + 9),
      w: Math.random() * 8 + 5,
      h: Math.random() * 5 + 3,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: colors[(Math.random() * colors.length) | 0],
    }));

    const duration = 3400;
    const start = performance.now();
    const frame = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - t / duration);
      pieces.forEach((p) => {
        p.vy += 0.42;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (t < duration) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        canvas.hidden = true;
        confettiRunning = false;
      }
    };
    requestAnimationFrame(frame);
  }

  function initKonami() {
    const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let step = 0;
    addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === sequence[step]) step += 1;
      else step = key === sequence[0] ? 1 : 0;
      if (step === sequence.length) {
        step = 0;
        confetti();
        toast('🎉 Konami Code! ขอบคุณที่ตั้งใจดูพอร์ตโฟลิโอนี้ขนาดนี้ครับ');
      }
    });
  }

  /* ---------- ไอคอนจาก CDN โหลดไม่ได้ (เช่น ออฟไลน์) → แสดงตัวอักษรแทน ---------- */
  function initIconFallback() {
    const replace = (img) => {
      const fallback = document.createElement('span');
      fallback.className = 'icon-fallback';
      fallback.textContent = img.dataset.icon;
      img.replaceWith(fallback);
    };
    $$('img[data-icon]').forEach((img) => {
      if (img.complete && img.naturalWidth === 0) replace(img);
      else img.addEventListener('error', () => replace(img), { once: true });
    });
  }

  /* ---------- Boot ---------- */
  initMarquee();
  initIconFallback();
  initTheme();
  initNav();
  initProgress();
  initCursor();
  initPointerFX();
  initParticles();
  initTimeline();
  initLeague();
  initMicrobit();
  initTerminal();
  initSkills();
  initGrades();
  initQuote();
  initKonami();

  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear() + 543);

  queueScrollTasks();
  runPreloader().then(() => {
    initReveal();
    initTyped();
    initScramble();
    initCounters();
  });
})();
