(function () {
  var currentAudio;
  function setVolume(percent) {
    if (currentAudio && Number.isFinite(percent)) {
      currentAudio.volume = Math.max(0, Math.min(100, percent)) / 100;
    }
  }
  async function play(payload) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if (!payload) return;
    currentAudio = new Audio(payload.src);
    currentAudio.volume = payload.volume;
    await currentAudio.play();
  }
  window.SubmissionAudio = { play: play, setVolume: setVolume };
  window.dyrelog.onSubmissionSound(function (payload) {
    play(payload).catch(function (err) { console.warn('Could not play submission sound:', err.message); });
  });
})();
