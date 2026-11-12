/* Decode tutorial artwork before exposing dialogue. Share requests with the game. */
(() => {
  "use strict";
  const small = matchMedia("(pointer: coarse), (max-width: 700px)").matches;
  const cssImage = (name) => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value
      .slice(4, -1)
      .trim()
      .replace(/^["']|["']$/g, "");
  };
  async function tutorialFiles(attempt) {
    const deadline = Date.now() + 25000;
    // WebKit can run deferred JS before custom properties are computed.
    // Read the skin lazily, once the stylesheet has reached the style engine.
    while (true) {
      const files = {
        portrait: `assets/${small ? "lunna_novel_mobile" : "lunna_novel_pose"}.webp?v=47${attempt > 1 ? `&retry=${attempt}` : ""}`,
        frame: cssImage("--dialog-frame"),
        paper: cssImage("--dialog-paper"),
        nameplate: cssImage("--dialog-nameplate"),
      };
      if (files.frame && files.paper && files.nameplate) return files;
      if (Date.now() > deadline)
        throw new Error("Tutorial stylesheet unavailable");
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  let tutorialPromise;
  const pendingImages = new Set();
  const loadImage = (src, label) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      pendingImages.add(img);
      img.fetchPriority = "high";
      const timer = setTimeout(() => {
        pendingImages.delete(img);
        reject(new Error(`${label}: artwork timeout`));
      }, 25000);
      img.onload = async () => {
        try {
          if (img.decode) await img.decode();
          clearTimeout(timer);
          pendingImages.delete(img);
          resolve(img);
        } catch (error) {
          clearTimeout(timer);
          pendingImages.delete(img);
          reject(error);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        pendingImages.delete(img);
        reject(
          new Error(`${label}: artwork unavailable (${src.length} bytes)`),
        );
      };
      img.src = src;
    });
  let attempts = 0;
  function prepareTutorial() {
    if (!tutorialPromise) {
      tutorialPromise = tutorialFiles(++attempts)
        .then(async (files) => {
          const images = await Promise.all(
            Object.entries(files).map(([label, src]) => loadImage(src, label)),
          );
          return { ...files, portraitImage: images[0], decodedImages: images };
        })
        .catch((error) => {
          tutorialPromise = null;
          throw error;
        });
    }
    return tutorialPromise;
  }
  let firstVisit = true;
  try {
    firstVisit = localStorage.getItem("ugolny_tutorial_seen_v3") !== "1";
  } catch (_) {
    /* optional storage */
  }
  let releaseWorld;
  const skipGate = new Promise((resolve) => {
    releaseWorld = resolve;
  });
  const initialTutorialReady = firstVisit
    ? Promise.race([prepareTutorial().catch(() => null), skipGate])
    : Promise.resolve();
  window.UgolnyAssets = Object.freeze({
    prepareTutorial,
    initialTutorialReady,
    releaseWorld,
  });
})();
