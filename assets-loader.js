/* Decode the supplied WebP files before exposing dialogue. Never recompress them. */
(() => {
  "use strict";
  const desktopArt = !matchMedia("(pointer: coarse)").matches;
  const pendingImages = new Set();
  const loadImage = (src, label, priority = "high") =>
    new Promise((resolve, reject) => {
      const img = new Image();
      pendingImages.add(img);
      img.fetchPriority = priority;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        pendingImages.delete(img);
        if (error) reject(error);
        else resolve(img);
      };
      const timer = setTimeout(
        () => finish(new Error(`${label}: artwork timeout`)),
        25000,
      );
      img.onload = async () => {
        try {
          if (img.decode) await img.decode();
          finish();
        } catch (error) {
          finish(error);
        }
      };
      img.onerror = () => finish(new Error(`${label}: artwork unavailable`));
      img.src = src;
    });

  const canvas = (width, height) => {
    const element = document.createElement("canvas");
    element.width = width;
    element.height = height;
    return element;
  };
  function prepareFrame(parts) {
    // All three files share one canvas. Overlay them without changing their pixels.
    const full = canvas(parts[0].naturalWidth, parts[0].naturalHeight);
    const fullContext = full.getContext("2d");
    for (const part of parts) fullContext.drawImage(part, 0, 0);
    // On narrow screens the name ribbon is independent of the flexible body.
    const nameplate = canvas(720, 202);
    const nameContext = nameplate.getContext("2d");
    // Follow the ribbon outline so the paper behind it stays in the body layer.
    nameContext.beginPath();
    nameContext.moveTo(4, 0);
    nameContext.lineTo(720, 0);
    nameContext.lineTo(720, 65);
    nameContext.lineTo(647, 113);
    nameContext.lineTo(694, 202);
    nameContext.lineTo(592, 179);
    nameContext.lineTo(76, 179);
    nameContext.bezierCurveTo(58, 210, 12, 210, 4, 193);
    nameContext.closePath();
    nameContext.clip();
    nameContext.drawImage(full, 120, 0, 720, 202, 0, 0, 720, 202);
    const body = canvas(2109, 480);
    const bodyContext = body.getContext("2d");
    bodyContext.drawImage(full, 0, 109, 2109, 480, 0, 0, 2109, 480);
    // Continue the supplied straight middle underneath the detached name ribbon.
    bodyContext.clearRect(118, 0, 730, 100);
    bodyContext.drawImage(full, 860, 109, 730, 100, 118, 0, 730, 100);
    const paintedSizes = new WeakMap();
    function paintFrame(target, width, height) {
      if (!width || !height) return;
      const density = Math.min(devicePixelRatio || 1, 3);
      const previous = paintedSizes.get(target);
      if (
        previous?.width === width &&
        previous?.height === height &&
        previous?.density === density
      )
        return;
      target.width = Math.ceil(width * density);
      target.height = Math.ceil(height * density);
      const ctx = target.getContext("2d");
      ctx.setTransform(density, 0, 0, density, 0, 0);
      ctx.imageSmoothingQuality = "high";
      // Only the plain centre/edges stretch. Corners keep the same uniform scale.
      const sx = [0, 300, 1700, 2109],
        sy = [0, 70, 310, 480];
      const dx = [0, 60, width - 81.8, width],
        dy = [0, 14, height - 34, height];
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          ctx.drawImage(
            body,
            x === 1 ? 900 : sx[x],
            sy[y],
            x === 1 ? 700 : sx[x + 1] - sx[x],
            sy[y + 1] - sy[y],
            dx[x],
            dy[y],
            dx[x + 1] - dx[x],
            dy[y + 1] - dy[y],
          );
        }
      }
      paintedSizes.set(target, { width, height, density });
    }
    return { desktopFrame: full, nameplate, paintFrame };
  }
  let tutorialPromise,
    attempts = 0;
  function prepareTutorial() {
    if (!tutorialPromise) {
      const query = `?v=48${++attempts > 1 ? `&retry=${attempts}` : ""}`;
      tutorialPromise = Promise.all(
        ["lunna", "dial1", "dial2", "dial3"].map((name) =>
          loadImage(`assets/${name}.webp${query}`, name),
        ),
      )
        .then(([portraitImage, ...parts]) => ({
          portraitImage,
          ...prepareFrame(parts),
        }))
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
    desktopArt,
    loadImage,
    prepareTutorial,
    initialTutorialReady,
    releaseWorld,
  });
})();
