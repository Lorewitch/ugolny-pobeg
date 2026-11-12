/* Tutorial, accessible dialogs and fullscreen display. Physics lives in game.js. */
(() => {
  "use strict";
  const api = window.UgolnyGameAPI;
  const $ = (id) => document.getElementById(id);
  const root = $("gameRoot");
  const backdrop = $("featureBackdrop"),
    dialog = $("featureDialog"),
    content = $("featureContent");
  const fullscreenButton = $("fullscreenBtn"),
    rotateHint = $("rotateHint");
  const portrait = matchMedia(
    "(orientation: portrait) and (max-width: 800px) and (pointer: coarse)",
  );
  const orientation = matchMedia("(orientation: portrait)");
  const STORAGE_KEY = "ugolny_tutorial_seen_v3";
  // Four canonical scenes. Each page is a short part of the EXACT supplied text.
  // Moving between pages changes text only; portrait and parchment remain mounted.
  const story = [
    [
      "Опять нашкодил? Ну, раз тебе так хочется, то <strong>попробуй сбежать</strong>. Хотя должна признать, твоя уверенность в собственных силах <em>несколько умиляет</em>",
      "...ведь <strong>попадание в банку — лишь вопрос времени</strong>. Впрочем, не буду лишать тебя удовольствия убедиться во всём самостоятельно.",
    ],
    [
      "К слову, я тут кое-где расставила банки. <em>Исключительно ради твоего удобства, разумеется.</em> Советую не усложнять себе жизнь и <strong>запрыгивать в первую попавшуюся</strong>.",
      "Для этого нажми <strong>пробел, стрелку вверх или коснись экрана</strong>. Видишь? Всё гораздо проще, чем твои <em>бессмысленные попытки сбежать</em>.",
    ],
    [
      'Ах да, у тебя всего <strong>три единицы ХП</strong> <img class="novel-inline-icon" src="assets/hp_fire_full.webp" alt="огонёк здоровья">. <em>Будешь избегать банок — начнёшь терять ХП.</em>',
      "Не спрашивай почему, просто доверься моему <em>богатому опыту воспитания котиков</em>. Так что советую хорошенько целиться — <strong>здоровье, знаешь ли, не бесконечное</strong>.",
      'А за собранные <strong>примогемы</strong> <img class="novel-inline-icon" src="assets/primogem_ink.webp" alt="примогема"> я даже добавлю немного к твоей <em>скорости запрыгивания в банку</em>! Не благодари, мне совершенно несложно.',
    ],
    [
      "Ну вот, инструктаж окончен. Надеюсь, мои советы помогут тебе принять <strong>единственное разумное решение</strong>.",
      "А если нет... Что ж, <strong>физика рано или поздно возьмёт своё</strong>. Я пока выберу для тебя <em>банку попросторнее</em>.",
    ],
  ];
  const pages = story.flatMap((scene, sceneIndex) =>
    scene.map((html, pageIndex) => ({
      html,
      sceneIndex,
      pageIndex,
      scenePages: scene.length,
    })),
  );
  let step = 0,
    firstLaunch = false,
    previousFocus = null;
  let rotateFocus = null,
    allowPortrait = false,
    immersive = false;
  let orientationLocked = false,
    fullscreenPending = false,
    statusTimer;
  const isOpen = () => !backdrop.hidden;
  const nativeFullscreen = () =>
    document.fullscreenElement || document.webkitFullscreenElement;
  const isExpanded = () => nativeFullscreen() === root || immersive;
  const modalOpen = () => isOpen() || !rotateHint.hidden;
  function seen() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }
  function markSeen() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch (_) {
      /* optional storage */
    }
  }
  function syncModal() {
    const active = modalOpen();
    root.querySelector(".game-shell").inert = active;
    document.querySelector(".page-head").inert = active;
    document.body.classList.toggle("has-modal", active);
  }
  function restoreFocus(element) {
    if (element?.isConnected && !element.closest("[hidden], [inert]"))
      element.focus({ preventScroll: true });
    else $("playBtn").focus({ preventScroll: true });
  }
  function close() {
    if (!isOpen()) return;
    if (firstLaunch) markSeen();
    backdrop.hidden = true;
    content.replaceChildren();
    delete dialog.dataset.mode;
    firstLaunch = false;
    syncModal();
    restoreFocus(previousFocus);
    previousFocus = null;
  }
  function advance(direction = 1) {
    if (!isOpen()) return;
    if (direction < 0) {
      if (step > 0) {
        step--;
        updateScene();
      }
      return;
    }
    if (step < pages.length - 1) {
      step++;
      updateScene();
      return;
    }
    const start = firstLaunch;
    close();
    if (start) api.begin();
  }
  function open(first = false) {
    if (!isOpen()) previousFocus = document.activeElement;
    api.pause();
    rotateHint.hidden = true;
    firstLaunch = first;
    step = 0;
    dialog.dataset.mode = "novel";
    content.innerHTML = `<div class="novel-scene" role="group" aria-label="Обучение Лунны">
      <div class="novel-stage" id="novelStage" role="button" tabindex="0" aria-label="Следующая страница" aria-describedby="novelLine">
        <div class="novel-paper">
          <div class="novel-display-name">Лунна</div>
          <div class="novel-line" id="novelLine" aria-live="polite"></div>
        </div>
        <img class="novel-character" src="assets/lunna_novel_pose.webp" alt="Лунна" draggable="false" decoding="async">
      </div>
      <div class="novel-footer">
        <div class="novel-controls">
          <button class="feature-btn" type="button" id="novelSkip">Пропустить</button>
          <button class="feature-btn" type="button" id="novelBack">← Назад</button>
          <button class="feature-btn" type="button" id="novelNext">Далее →</button>
        </div>
        <div class="novel-meta" aria-label="Страницы обучения"><span class="novel-progress" id="novelProgress" aria-hidden="true"></span></div>
      </div>
    </div>`;
    $("novelSkip").onclick = close;
    $("novelBack").onclick = () => advance(-1);
    $("novelNext").onclick = () => advance();
    $("novelStage").addEventListener("pointerdown", (ev) => {
      if (ev.isPrimary === false || ev.button !== 0) return;
      if (ev.target.closest(".novel-line")) return;
      ev.preventDefault();
      advance();
    });
    backdrop.hidden = false;
    syncModal();
    updateScene();
    $("novelStage").focus({ preventScroll: true });
  }
  function updateScene() {
    const page = pages[step];
    $("novelLine").innerHTML = page.html;
    $("novelProgress").textContent = pages
      .map((_, i) => (i === step ? "✦" : "✧"))
      .join(" ");
    $("novelBack").disabled = step === 0;
    $("novelNext").textContent =
      step === pages.length - 1
        ? firstLaunch
          ? "Побежали! ✦"
          : "Завершить ✓"
        : "Далее →";
    $("novelStage").setAttribute(
      "aria-label",
      `Страница ${step + 1} из ${pages.length}. ${step === pages.length - 1 ? "Завершить обучение" : "Следующая страница"}`,
    );
  }
  function syncOrientation() {
    if (!portrait.matches || allowPortrait || isOpen()) {
      const wasOpen = !rotateHint.hidden;
      rotateHint.hidden = true;
      syncModal();
      if (wasOpen) restoreFocus(rotateFocus);
      return;
    }
    if (api.getState() === "running" && rotateHint.hidden) {
      rotateFocus = document.activeElement;
      api.pause();
      rotateHint.hidden = false;
      syncModal();
      $("rotateDismiss").focus({ preventScroll: true });
    }
  }
  function status(message) {
    clearTimeout(statusTimer);
    $("displayStatus").textContent = message;
    $("displayStatus").hidden = false;
    statusTimer = setTimeout(() => {
      $("displayStatus").hidden = true;
    }, 5500);
  }
  function syncFullscreen() {
    const active = isExpanded();
    root.classList.toggle("is-expanded", active);
    root.classList.toggle("is-immersive", immersive);
    document.body.classList.toggle("has-immersive", immersive);
    fullscreenButton.textContent = active ? "⤢" : "⛶";
    const label = active ? "Выйти из полного экрана" : "Во весь экран";
    fullscreenButton.setAttribute("aria-label", label);
    fullscreenButton.setAttribute("aria-pressed", String(active));
    fullscreenButton.title = `${label} (F)`;
    if (!active && orientationLocked) {
      try {
        screen.orientation?.unlock();
      } catch (_) {
        /* optional orientation API */
      }
      orientationLocked = false;
    }
  }
  async function fullscreen() {
    if (fullscreenPending) return;
    fullscreenPending = true;
    api.pause();
    try {
      if (nativeFullscreen() === root) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit.call(document);
      } else if (immersive) {
        immersive = false;
      } else {
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        try {
          if (!request) throw new Error("Fullscreen API unavailable");
          await request.call(root);
        } catch (_) {
          immersive = true;
          status(
            "Игра развёрнута на окно браузера. Панели браузера могут остаться видимыми.",
          );
        }
        syncFullscreen();
        if (nativeFullscreen() === root && screen.orientation?.lock) {
          try {
            await screen.orientation.lock("landscape");
            orientationLocked = true;
          } catch (_) {
            /* rotation remains optional */
          }
        }
      }
    } catch (_) {
      status("Не удалось изменить полноэкранный режим. Попробуй ещё раз.");
    } finally {
      fullscreenPending = false;
      syncFullscreen();
      syncOrientation();
    }
  }
  for (const event of ["fullscreenchange", "webkitfullscreenchange"]) {
    document.addEventListener(event, () => {
      api.pause();
      syncFullscreen();
      syncOrientation();
    });
  }
  $("tutorialBtn").onclick = () => open(false);
  fullscreenButton.onclick = fullscreen;
  $("rotateFullscreen").onclick = fullscreen;
  $("rotateDismiss").onclick = () => {
    allowPortrait = true;
    syncOrientation();
  };
  document.addEventListener("ugolny:statechange", syncOrientation);
  portrait.addEventListener("change", syncOrientation);
  orientation.addEventListener("change", () => {
    api.pause();
    syncOrientation();
  });
  document.addEventListener("keydown", (ev) => {
    if (modalOpen() && ev.code === "Tab") {
      const modal = isOpen() ? dialog : rotateHint;
      const items = [
        ...modal.querySelectorAll('button:not(:disabled), [tabindex="0"]'),
      ];
      const first = items[0],
        last = items.at(-1);
      if (
        ev.shiftKey &&
        (document.activeElement === first ||
          !modal.contains(document.activeElement))
      ) {
        ev.preventDefault();
        last?.focus();
      } else if (
        !ev.shiftKey &&
        (document.activeElement === last ||
          !modal.contains(document.activeElement))
      ) {
        ev.preventDefault();
        first?.focus();
      }
      return;
    }
    if (isOpen()) {
      if (ev.repeat) return;
      const onButton = ev.target.closest?.("button");
      if ((ev.code === "Space" || ev.code === "Enter") && !onButton) {
        ev.preventDefault();
        advance();
      } else if (ev.code === "ArrowLeft") {
        ev.preventDefault();
        advance(-1);
      } else if (ev.code === "ArrowRight") {
        ev.preventDefault();
        advance();
      } else if (ev.code === "Escape") {
        ev.preventDefault();
        close();
      }
      return;
    }
    if (ev.code === "Escape" && immersive) {
      ev.preventDefault();
      fullscreen();
      return;
    }
    if (
      ev.defaultPrevented ||
      ev.repeat ||
      ev.ctrlKey ||
      ev.metaKey ||
      ev.altKey ||
      modalOpen()
    )
      return;
    if (
      ev.target.closest?.('input, textarea, select, [contenteditable="true"]')
    )
      return;
    if (ev.code === "KeyF") {
      ev.preventDefault();
      fullscreen();
    }
  });
  window.UgolnyFeatures = Object.freeze({
    isOpen: modalOpen,
    openTutorial: open,
  });
  syncFullscreen();
  if (!seen()) open(true);
})();
