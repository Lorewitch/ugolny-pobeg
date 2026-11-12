/* Responsive tutorial, viewport display and optional native orientation lock. */
(() => {
  "use strict";
  const api = window.UgolnyGameAPI;
  const $ = (id) => document.getElementById(id);
  const root = $("gameRoot"),
    host = $("displayHost");
  const backdrop = $("featureBackdrop"),
    dialog = $("featureDialog"),
    content = $("featureContent");
  const fullscreenButton = $("fullscreenBtn");
  const coarse = matchMedia("(pointer: coarse)");
  const STORAGE_KEY = "ugolny_tutorial_seen_v3";
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
      'А за собранные <strong>примогемы</strong> <img class="novel-inline-icon" src="assets/primogem_ink.webp?v=48" alt="примогема"> я даже добавлю немного к твоей <em>скорости запрыгивания в банку</em>! Не благодари, мне совершенно несложно.',
    ],
    [
      "Ну вот, инструктаж окончен. Надеюсь, мои советы помогут тебе принять <strong>единственное разумное решение</strong>.",
      "А если нет... Что ж, <strong>физика рано или поздно возьмёт своё</strong>. Я пока выберу для тебя <em>банку попросторнее</em>.",
    ],
  ];
  const pages = story.flat();
  let step = 0,
    firstLaunch = false,
    previousFocus = null,
    openToken = 0;
  let immersive = false,
    orientationLocked = false,
    fullscreenPending = false;
  let statusTimer,
    viewportFrame = 0,
    paperObserver;
  const isOpen = () => !backdrop.hidden;
  const nativeFullscreen = () =>
    document.fullscreenElement || document.webkitFullscreenElement;
  const isExpanded = () => nativeFullscreen() === host || immersive;
  function seen() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }
  function syncModal() {
    root.querySelector(".game-shell").inert = isOpen();
    document.querySelector(".page-head").inert = isOpen();
    document.body.classList.toggle("has-modal", isOpen());
  }
  function close() {
    if (!isOpen()) return;
    window.UgolnyAssets.releaseWorld();
    if (firstLaunch) {
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch (_) {
        /* optional storage */
      }
    }
    openToken++;
    paperObserver?.disconnect();
    backdrop.hidden = true;
    content.replaceChildren();
    delete dialog.dataset.mode;
    firstLaunch = false;
    syncModal();
    if (
      previousFocus?.isConnected &&
      !previousFocus.closest("[inert], [hidden]")
    )
      previousFocus.focus({ preventScroll: true });
    else $("playBtn").focus({ preventScroll: true });
    previousFocus = null;
  }
  function advance(direction = 1) {
    if (!isOpen() || !$("novelStage")) return;
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
  function updateScene() {
    $("novelLine").innerHTML = pages[step];
    $("novelProgress").textContent = pages
      .map((_, i) => (i === step ? "✦" : "✧"))
      .join(" ");
    $("novelProgress").setAttribute(
      "aria-label",
      `Страница ${step + 1} из ${pages.length}`,
    );
    $("novelBack").disabled = step === 0;
    $("novelNext").textContent =
      step === pages.length - 1
        ? firstLaunch
          ? "Побежали! ✦"
          : "Завершить ✓"
        : "Далее →";
    $("novelStage").setAttribute(
      "aria-label",
      `Страница ${step + 1} из ${pages.length}. Следующая страница`,
    );
  }
  async function open(first = false) {
    if (!isOpen()) previousFocus = document.activeElement;
    api.pause();
    firstLaunch = first;
    step = 0;
    const token = ++openToken;
    dialog.dataset.mode = "loading";
    content.innerHTML = `<div class="tutorial-loading" role="status"><span class="loading-orbit" aria-hidden="true">✦</span><p id="tutorialLoadText">Загружаем обучение…</p><button class="feature-btn" id="tutorialRetry" type="button" hidden>Повторить</button><button class="feature-btn" id="tutorialCancel" type="button">Пропустить</button></div>`;
    $("tutorialCancel").onclick = close;
    $("tutorialRetry").onclick = () => open(firstLaunch);
    backdrop.hidden = false;
    syncModal();
    $("tutorialCancel").focus({ preventScroll: true });
    let files;
    try {
      files = await window.UgolnyAssets.prepareTutorial();
    } catch (_) {
      if (token !== openToken || !isOpen()) return;
      $("tutorialLoadText").textContent =
        "Не удалось загрузить рисунки. Попробуем ещё раз?";
      $("tutorialRetry").hidden = false;
      return;
    }
    if (token !== openToken || !isOpen()) return;
    dialog.dataset.mode = "novel";
    content.innerHTML = `<button class="icon-btn novel-expand" id="novelFullscreen" type="button" aria-label="Во весь экран" title="Во весь экран">⛶</button><div class="novel-scene" role="group" aria-label="Обучение Лунны">
      <div class="novel-stage" id="novelStage" role="button" tabindex="0" aria-label="Следующая страница" aria-describedby="novelLine">
        <span id="novelCharacterSlot"></span>
        <div class="novel-paper" id="novelPaper">
          <span id="novelOriginalFrameSlot"></span>
          <div class="novel-skin" id="novelSkin" aria-hidden="true"><canvas id="novelBodyCanvas"></canvas></div>
          <div class="novel-display-name"><span id="novelNameSkinSlot"></span><span>Лунна</span></div>
          <div class="novel-line" id="novelLine" aria-live="polite"></div>
        </div>
      </div>
      <div class="novel-footer"><div class="novel-controls">
        <button class="feature-btn" type="button" id="novelSkip">Пропустить</button>
        <button class="feature-btn" type="button" id="novelBack">← Назад</button>
        <button class="feature-btn" type="button" id="novelNext">Далее →</button>
      </div><span class="novel-progress" id="novelProgress" role="img" aria-label="Страница обучения"></span></div>
    </div>`;
    files.desktopFrame.className = "novel-original-skin";
    files.desktopFrame.setAttribute("aria-hidden", "true");
    $("novelOriginalFrameSlot").replaceWith(files.desktopFrame);
    files.nameplate.className = "novel-name-skin";
    files.nameplate.setAttribute("aria-hidden", "true");
    $("novelNameSkinSlot").replaceWith(files.nameplate);
    files.portraitImage.className = "novel-character";
    files.portraitImage.alt = "Лунна";
    files.portraitImage.draggable = false;
    $("novelCharacterSlot").replaceWith(files.portraitImage);
    $("novelSkip").onclick = close;
    $("novelBack").onclick = () => advance(-1);
    $("novelNext").onclick = () => advance();
    $("novelFullscreen").onclick = fullscreen;
    $("novelStage").addEventListener("pointerdown", (ev) => {
      if (ev.isPrimary === false || ev.button !== 0) return;
      ev.preventDefault();
      advance();
    });
    paperObserver?.disconnect();
    const paintPaper = () => {
      const paper = $("novelPaper"),
        stage = $("novelStage");
      if (paper && stage) {
        stage.style.setProperty("--paper-height", `${paper.offsetHeight}px`);
        if (!root.classList.contains("tutorial-desktop"))
          files.paintFrame(
            $("novelBodyCanvas"),
            paper.clientWidth,
            paper.clientHeight,
          );
      }
    };
    paperObserver = new ResizeObserver(paintPaper);
    paperObserver.observe($("novelPaper"));
    updateScene();
    $("novelStage").focus({ preventScroll: true });
    syncViewport();
    paintPaper();
  }
  function status(message) {
    clearTimeout(statusTimer);
    $("displayStatus").textContent = message;
    $("displayStatus").hidden = false;
    statusTimer = setTimeout(() => {
      $("displayStatus").hidden = true;
    }, 4500);
  }
  function syncViewport() {
    viewportFrame = 0;
    const vv = window.visualViewport;
    const width = Math.round(vv?.width || innerWidth),
      height = Math.round(vv?.height || innerHeight);
    const active = isExpanded();
    const rotated = active && coarse.matches && width < height;
    document.documentElement.style.setProperty(
      "--visible-height",
      `${height}px`,
    );
    document.documentElement.style.setProperty("--visible-width", `${width}px`);
    host.style.setProperty("--viewport-top", `${vv?.offsetTop || 0}px`);
    host.style.setProperty("--viewport-left", `${vv?.offsetLeft || 0}px`);
    host.classList.toggle("is-expanded-host", active);
    root.classList.toggle("is-expanded", active);
    root.classList.toggle("is-rotated", rotated);
    const effectiveHeight = rotated ? width : height;
    const effectiveWidth = rotated ? height : width;
    root.classList.toggle(
      "tutorial-desktop",
      window.UgolnyAssets.desktopArt &&
        effectiveWidth >= 900 &&
        effectiveHeight >= 420,
    );
    root.classList.toggle(
      "is-landscape-view",
      effectiveWidth > effectiveHeight,
    );
    root.classList.toggle(
      "is-compact-view",
      effectiveHeight <= 560 && effectiveWidth > effectiveHeight,
    );
    root.classList.toggle(
      "is-short-view",
      effectiveHeight <= 480 && effectiveWidth > effectiveHeight,
    );
    root.classList.toggle(
      "is-tiny-view",
      effectiveHeight <= 280 && effectiveWidth > effectiveHeight,
    );
    document.body.classList.toggle("has-immersive", active);
    const label = active ? "Выйти из полного экрана" : "Во весь экран";
    fullscreenButton.textContent = active ? "⤢" : "⛶";
    fullscreenButton.setAttribute("aria-label", label);
    fullscreenButton.setAttribute("aria-pressed", String(active));
    fullscreenButton.title = `${label} (F)`;
    if ($("novelFullscreen")) {
      $("novelFullscreen").textContent = active ? "⤢" : "⛶";
      $("novelFullscreen").setAttribute("aria-label", label);
      $("novelFullscreen").title = label;
    }
    if (!active && orientationLocked) {
      try {
        screen.orientation?.unlock();
      } catch (_) {
        /* optional API */
      }
      orientationLocked = false;
    }
  }
  function scheduleViewport() {
    if (!viewportFrame) viewportFrame = requestAnimationFrame(syncViewport);
  }
  async function fullscreen() {
    if (fullscreenPending) return;
    fullscreenPending = true;
    api.pause();
    try {
      if (nativeFullscreen() === host) {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(
          document,
        );
      } else if (immersive) {
        immersive = false;
      } else {
        const request = host.requestFullscreen || host.webkitRequestFullscreen;
        try {
          if (!request) throw new Error("Unavailable");
          await request.call(host);
          if (nativeFullscreen() !== host) immersive = true;
        } catch (_) {
          immersive = true;
        }
        syncViewport();
        if (nativeFullscreen() === host && screen.orientation?.lock) {
          try {
            await screen.orientation.lock("landscape");
            orientationLocked = true;
          } catch (_) {
            /* CSS landscape remains available */
          }
        }
      }
    } catch (_) {
      status("Не удалось изменить полноэкранный режим. Попробуй ещё раз.");
    } finally {
      fullscreenPending = false;
      syncViewport();
    }
  }
  for (const event of ["fullscreenchange", "webkitfullscreenchange"])
    document.addEventListener(event, () => {
      if (nativeFullscreen() === host) immersive = false;
      api.pause();
      syncViewport();
    });
  window.addEventListener("resize", scheduleViewport);
  window.visualViewport?.addEventListener("resize", scheduleViewport);
  window.visualViewport?.addEventListener("scroll", scheduleViewport);
  matchMedia("(orientation: portrait)").addEventListener("change", () => {
    api.pause();
    scheduleViewport();
  });
  $("tutorialBtn").onclick = () => open(false);
  fullscreenButton.onclick = fullscreen;
  document.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (isOpen() && ev.code === "Tab") {
      const items = [
        ...dialog.querySelectorAll(
          'button:not(:disabled):not([hidden]), [tabindex="0"]',
        ),
      ];
      const first = items[0],
        last = items.at(-1);
      if (
        ev.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        ev.preventDefault();
        last?.focus();
      } else if (
        !ev.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        ev.preventDefault();
        first?.focus();
      }
      return;
    }
    if (isOpen()) {
      if (ev.repeat) return;
      if (
        (ev.code === "Space" || ev.code === "Enter") &&
        !ev.target.closest?.("button")
      ) {
        ev.preventDefault();
        advance();
      } else if (ev.code === "ArrowLeft") {
        ev.preventDefault();
        advance(-1);
      } else if (ev.code === "ArrowRight") {
        ev.preventDefault();
        advance();
      } else if (ev.code === "KeyF") {
        ev.preventDefault();
        fullscreen();
      } else if (ev.code === "Escape") {
        ev.preventDefault();
        close();
      }
      return;
    }
    if (ev.code === "Escape" && isExpanded()) {
      ev.preventDefault();
      api.pause();
      if (immersive) fullscreen();
      return;
    }
    if (
      ev.defaultPrevented ||
      ev.repeat ||
      ev.target.closest?.('input, textarea, select, [contenteditable="true"]')
    )
      return;
    if (ev.code === "KeyF") {
      ev.preventDefault();
      fullscreen();
    }
  });
  window.UgolnyFeatures = Object.freeze({ isOpen, openTutorial: open });
  syncViewport();
  if (!seen()) open(true);
})();
