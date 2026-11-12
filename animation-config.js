/* Shared artwork registration for the game and visual preview. */
(() => {
  "use strict";
  const config = {
    version: 47,
    frameWidth: 512,
    frameHeight: 384,
    drawWidth: 316,
    drawHeight: 237,
    groundAnchor: 205.5234375,
    runFrames: 12,
    runColumns: 4,
    runFps: 29.8,
    jumpFrames: 12,
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
    sceneHeight: 697,
    files: {
      backdrop: "assets/back_game.webp?v=47",
      platform: "assets/platform_game.webp?v=47",
      run: "assets/run_spritesheet.webp?v=47",
      jump: "assets/jump_spritesheet.webp?v=47",
      jar: "assets/banka.webp?v=47",
      primogem: "assets/primogem_ink.webp?v=47",
    },
  };
  config.runFrame = (step) =>
    ((Math.floor(step) % config.runFrames) + config.runFrames) %
    config.runFrames;
  Object.freeze(config.files);
  Object.freeze(config.jump);
  window.UgolnyAnimation = Object.freeze(config);
})();
