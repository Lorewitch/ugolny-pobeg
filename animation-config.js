/* Artwork dimensions and animation timing. */
(() => {
  "use strict";
  const config = {
    frameWidth: 512,
    frameHeight: 384,
    drawWidth: 316,
    drawHeight: 237,
    groundAnchor: 205.5234375,
    runFrames: 12,
    runColumns: 4,
    runFps: 29.8,
    jumpColumns: 4,
    jump: {
      takeoff: 0.04,
      rise: 0.175,
      hang: 0.76,
      fall: 0.2,
      land: 0.055,
      height: 172,
    },
    sceneWidth: 1324,
    files: {
      backdrop: "assets/back_game.webp?v=48",
      platform: "assets/platform_game.webp?v=48",
      run: "assets/run_spritesheet.webp?v=47",
      jump: "assets/jump_spritesheet.webp?v=47",
      jar: "assets/banka.webp?v=48",
      primogem: "assets/primogem_ink.webp?v=48",
    },
  };
  config.runFrame = (step) =>
    ((Math.floor(step) % config.runFrames) + config.runFrames) %
    config.runFrames;
  Object.freeze(config.files);
  Object.freeze(config.jump);
  window.UgolnyAnimation = Object.freeze(config);
})();
