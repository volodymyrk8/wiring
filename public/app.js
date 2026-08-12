(() => {
  const root = document.getElementById("app");
  const BASE = root.dataset.base || "";
  const state = {
    user: null,
    catalog: null,
    view: "home",
    cards: [],
    index: 0,
    matches: [],
    filters: { neuro: [], vibe: [] },
    error: "",
    toast: "",
    busy: false,
  };

  const api = async (path, opts = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({ ok: false, error: "битый ответ" }));
    if (!res.ok || data.ok === false) throw new Error(data.error || `ошибка ${res.status}`);
    return data;
  };

  const photoUrl = (photo, name) => {
    if (photo) return `${BASE}/public/${photo}`;
    const hue = [...(name || "?")].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 520'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='hsl(${hue} 40% 28%)'/><stop offset='1' stop-color='hsl(${(hue + 40) % 360} 50% 18%)'/></linearGradient></defs><rect width='400' height='520' fill='url(#g)'/><text x='200' y='280' text-anchor='middle' fill='#d8ff3c' font-size='84' font-family='Georgia'>${(name || "?").slice(0, 1)}</text></svg>`
    );
    return `data:image/svg+xml,${svg}`;
  };

  const labelOf = (kind, id) => {
    const list = state.catalog?.[kind] || [];
    return (list.find((x) => x.id === id) || {}).label || id;
  };

  const chips = (kind, selected, onToggle) =>
    (state.catalog?.[kind] || [])
      .map((item) => {
        const on = selected.includes(item.id) ? "on" : "";
        return `<button type="button" class="chip ${kind === "vibe" ? "vibe" : ""} ${on}" data-kind="${kind}" data-id="${item.id}" title="${item.hint}">${item.label}</button>`;
      })
      .join("");

  const bindChips = (selectedMap) => {
    root.querySelectorAll(".chip[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.kind;
        const id = btn.dataset.id;
        const arr = selectedMap[kind];
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(id);
        btn.classList.toggle("on", i < 0);
      });
    });
  };

  const toast = (text) => {
    state.toast = text;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  };

  const nav = () => {
    if (!state.user) return "";
    return `
      <div class="topbar">
        <div class="brand">WIR<span>ING</span></div>
        <div class="nav">
          <button data-nav="deck" class="${state.view === "deck" ? "active" : ""}">свайп</button>
          <button data-nav="matches" class="${state.view === "matches" ? "active" : ""}">мэтчи</button>
          <button data-nav="profile" class="${state.view === "profile" ? "active" : ""}">я</button>
        </div>
      </div>`;
  };

  const homeView = () => `
    <section class="panel hero">
      <div class="brand">WIR<span>ING</span></div>
      <h1>Тиндер для тех, у кого проводка не из коробки.</h1>
      <p class="lede">Регистрируешься, помечаешь ASD, ADHD, ПРЛ, «neurospicy», late-diagnosed и прочую современную классификацию — и свайпаешь людей с похожей схемой.</p>
      <div class="scores">
        <div class="score"><b>8 / 10</b><span>пиздатость идеи как эксперимента</span></div>
        <div class="score"><b>5 / 10</b><span>бизнес-перспектива: холодный старт убивает дейтинг</span></div>
      </div>
      <div class="actions">
        <button class="solid" data-nav="register">создать профиль</button>
        <button class="ghost" data-nav="login">войти</button>
        <button class="ghost" id="demo">свайпать сразу</button>
      </div>
    </section>`;

  const authForm = (mode) => {
    const neuro = [];
    const vibe = [];
    return {
      html: `
      ${nav()}
      <section class="panel">
        <h2>${mode === "login" ? "Вход" : "Собрать профиль"}</h2>
        <form class="form" id="auth">
          <label>почта<input name="email" type="email" required autocomplete="username"></label>
          <label>пароль<input name="password" type="password" required minlength="6" autocomplete="${mode === "login" ? "current-password" : "new-password"}"></label>
          ${
            mode === "register"
              ? `
            <div class="row">
              <label>имя<input name="name" required minlength="2" maxlength="32"></label>
              <label>возраст<input name="age" type="number" min="18" max="99" required></label>
            </div>
            <label>город<input name="city" required minlength="2" maxlength="40"></label>
            <div class="row">
              <label>кто ты
                <select name="gender">${(state.catalog.genders || []).map((g) => `<option value="${g.id}">${g.label}</option>`).join("")}</select>
              </label>
              <label>кого ищешь
                <select name="looking_for">${(state.catalog.looking_for || []).map((g) => `<option value="${g.id}">${g.label}</option>`).join("")}</select>
              </label>
            </div>
            <div>
              <div class="hint">нейротип — хотя бы один</div>
              <div class="chips" id="neuro">${chips("neuro", neuro)}</div>
            </div>
            <div>
              <div class="hint">современные ярлыки — по вкусу</div>
              <div class="chips" id="vibe">${chips("vibe", vibe)}</div>
            </div>
            <label>био<textarea name="bio" maxlength="280" placeholder="специальный интерес, сенсорные лимиты, чего не делать"></textarea></label>
          `
              : ""
          }
          <div class="err" id="err"></div>
          <div class="actions">
            <button class="solid" type="submit">${mode === "login" ? "войти" : "зарегистрироваться"}</button>
            <button class="ghost" type="button" data-nav="${mode === "login" ? "register" : "login"}">${mode === "login" ? "нет профиля" : "уже есть вход"}</button>
          </div>
        </form>
      </section>`,
      bind() {
        if (mode === "register") bindChips({ neuro, vibe });
        root.querySelector("#auth").addEventListener("submit", async (e) => {
          e.preventDefault();
          const form = new FormData(e.target);
          const payload = Object.fromEntries(form.entries());
          if (mode === "register") {
            payload.age = Number(payload.age);
            payload.neuro = [...neuro];
            payload.vibe = [...vibe];
          }
          try {
            const data = await api(mode === "login" ? "/api/login" : "/api/register", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            state.user = data.user;
            state.view = "deck";
            await loadFeed();
            render();
          } catch (err) {
            root.querySelector("#err").textContent = err.message;
          }
        });
      },
    };
  };

  const cardHtml = (card) => `
    <article class="card" style="background-image:url('${photoUrl(card.photo, card.name)}')">
      <div class="stamp yes">YES</div>
      <div class="stamp no">NOPE</div>
      <div class="card-body">
        <h3>${escapeHtml(card.name)}, ${card.age}</h3>
        <div class="meta">${escapeHtml(card.city)} · ${labelOf("genders", card.gender)}</div>
        <p class="bio">${escapeHtml(card.bio)}</p>
        <div class="chips">
          ${card.neuro.map((id) => `<span class="chip on">${labelOf("neuro", id)}</span>`).join("")}
          ${card.vibe.map((id) => `<span class="chip vibe on">${labelOf("vibe", id)}</span>`).join("")}
        </div>
      </div>
    </article>`;

  const deckView = () => {
    const card = state.cards[state.index];
    return `
      ${nav()}
      <section class="panel">
        <div class="filters">
          <div class="hint">фильтр колоды — кого ищешь в этом заходе</div>
          <div class="chips" id="f-neuro">${chips("neuro", state.filters.neuro)}</div>
          <div class="chips" id="f-vibe" style="margin-top:8px">${chips("vibe", state.filters.vibe)}</div>
        </div>
        ${
          card
            ? `<div class="deck">${cardHtml(card)}</div>
               <div class="controls">
                 <button class="pass" id="no">✕</button>
                 <button class="like" id="yes">♥</button>
               </div>`
            : `<div class="empty">Колода пустая. Сними фильтры или подожди, пока кто-то ещё зарегистрируется.</div>`
        }
      </section>`;
  };

  const matchesView = () => `
    ${nav()}
    <section class="panel">
      <h2>Мэтчи</h2>
      ${
        state.matches.length
          ? `<div class="match-list">${state.matches
              .map(
                (m) => `
            <article class="match">
              <img src="${photoUrl(m.photo, m.name)}" alt="">
              <div>
                <h3>${escapeHtml(m.name)}, ${m.age}</h3>
                <p>${escapeHtml(m.city)} · ${m.neuro.map((id) => labelOf("neuro", id)).join(", ")}</p>
              </div>
            </article>`
              )
              .join("")}</div>`
          : `<div class="empty">Пока пусто. Лайкни кого-нибудь — сиды в демо лайкают в ответ.</div>`
      }
    </section>`;

  const profileView = () => {
    const u = state.user;
    const neuro = [...u.neuro];
    const vibe = [...u.vibe];
    return {
      html: `
      ${nav()}
      <section class="panel">
        <h2>Твоя схема</h2>
        <form class="form" id="me">
          <div class="row">
            <label>имя<input name="name" value="${escapeAttr(u.name)}" required></label>
            <label>возраст<input name="age" type="number" min="18" max="99" value="${u.age}" required></label>
          </div>
          <label>город<input name="city" value="${escapeAttr(u.city)}" required></label>
          <div class="row">
            <label>кто ты
              <select name="gender">${state.catalog.genders
                .map((g) => `<option value="${g.id}" ${g.id === u.gender ? "selected" : ""}>${g.label}</option>`)
                .join("")}</select>
            </label>
            <label>кого ищешь
              <select name="looking_for">${state.catalog.looking_for
                .map((g) => `<option value="${g.id}" ${g.id === u.looking_for ? "selected" : ""}>${g.label}</option>`)
                .join("")}</select>
            </label>
          </div>
          <div class="chips">${chips("neuro", neuro)}</div>
          <div class="chips">${chips("vibe", vibe)}</div>
          <label>био<textarea name="bio" maxlength="280">${escapeHtml(u.bio)}</textarea></label>
          <div class="err" id="err"></div>
          <div class="actions">
            <button class="solid" type="submit">сохранить</button>
            <button class="ghost" type="button" id="out">выйти</button>
          </div>
        </form>
      </section>`,
      bind() {
        bindChips({ neuro, vibe });
        root.querySelector("#out").addEventListener("click", async () => {
          await api("/api/logout", { method: "POST" });
          state.user = null;
          state.view = "home";
          render();
        });
        root.querySelector("#me").addEventListener("submit", async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(new FormData(e.target).entries());
          payload.age = Number(payload.age);
          payload.neuro = [...neuro];
          payload.vibe = [...vibe];
          try {
            const data = await api("/api/me", { method: "PATCH", body: JSON.stringify(payload) });
            state.user = data.user;
            toast("сохранено");
          } catch (err) {
            root.querySelector("#err").textContent = err.message;
          }
        });
      },
    };
  };

  const escapeHtml = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const escapeAttr = escapeHtml;

  const swipe = async (direction) => {
    const card = state.cards[state.index];
    if (!card || state.busy) return;
    state.busy = true;
    const el = root.querySelector(".card");
    if (el) {
      el.style.transition = "transform 0.28s ease, opacity 0.28s ease";
      el.style.transform = `translateX(${direction === "like" ? 140 : -140}px) rotate(${direction === "like" ? 10 : -10}deg)`;
      el.style.opacity = "0";
    }
    try {
      const data = await api("/api/swipe", {
        method: "POST",
        body: JSON.stringify({ target_id: card.id, direction }),
      });
      if (data.matched) toast(`мэтч с ${data.match.name}`);
    } catch (err) {
      toast(err.message);
    }
    state.index += 1;
    state.busy = false;
    render();
  };

  const wireDeck = () => {
    bindChips(state.filters);
    root.querySelectorAll("#f-neuro .chip, #f-vibe .chip").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await loadFeed();
        render();
      });
    });
    const yes = root.querySelector("#yes");
    const no = root.querySelector("#no");
    if (yes) yes.addEventListener("click", () => swipe("like"));
    if (no) no.addEventListener("click", () => swipe("pass"));
    const card = root.querySelector(".card");
    if (!card) return;
    let x0 = 0;
    let dx = 0;
    let tracking = false;
    const start = (x) => {
      tracking = true;
      x0 = x;
      dx = 0;
    };
    const move = (x) => {
      if (!tracking) return;
      dx = x - x0;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      const yesStamp = card.querySelector(".stamp.yes");
      const noStamp = card.querySelector(".stamp.no");
      yesStamp.style.opacity = dx > 20 ? Math.min(1, (dx - 20) / 80) : 0;
      noStamp.style.opacity = dx < -20 ? Math.min(1, (-dx - 20) / 80) : 0;
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      if (dx > 90) swipe("like");
      else if (dx < -90) swipe("pass");
      else {
        card.style.transition = "transform 0.2s ease";
        card.style.transform = "";
        card.querySelectorAll(".stamp").forEach((s) => (s.style.opacity = 0));
        setTimeout(() => (card.style.transition = ""), 200);
      }
    };
    card.addEventListener("pointerdown", (e) => {
      card.setPointerCapture(e.pointerId);
      start(e.clientX);
    });
    card.addEventListener("pointermove", (e) => move(e.clientX));
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  };

  const loadFeed = async () => {
    const q = new URLSearchParams();
    if (state.filters.neuro.length) q.set("neuro", state.filters.neuro.join(","));
    if (state.filters.vibe.length) q.set("vibe", state.filters.vibe.join(","));
    const data = await api(`/api/feed?${q.toString()}`);
    state.cards = data.cards;
    state.index = 0;
  };

  const render = () => {
    let bound = null;
    if (!state.catalog) {
      root.innerHTML = `<p class="lede">загрузка…</p>`;
      return;
    }
    if (!state.user && state.view === "register") bound = authForm("register");
    else if (!state.user && state.view === "login") bound = authForm("login");
    else if (!state.user) root.innerHTML = homeView();
    else if (state.view === "matches") root.innerHTML = matchesView();
    else if (state.view === "profile") bound = profileView();
    else root.innerHTML = deckView();

    if (bound) {
      root.innerHTML = bound.html;
      bound.bind();
    }
    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.view = btn.dataset.nav;
        if (state.view === "deck" && state.user) await loadFeed();
        if (state.view === "matches" && state.user) {
          const data = await api("/api/matches");
          state.matches = data.matches;
        }
        render();
      });
    });
    const demo = root.querySelector("#demo");
    if (demo) {
      demo.addEventListener("click", async () => {
        const data = await api("/api/demo", { method: "POST" });
        state.user = data.user;
        state.view = "deck";
        await loadFeed();
        render();
      });
    }
    if (state.user && state.view === "deck") wireDeck();
  };

  const boot = async () => {
    state.catalog = (await api("/api/catalog"));
    const me = await api("/api/me");
    state.user = me.user;
    state.view = me.user ? "deck" : "home";
    if (me.user) await loadFeed();
    render();
  };

  boot().catch((err) => {
    root.innerHTML = `<p class="err">${escapeHtml(err.message)}</p>`;
  });
})();
