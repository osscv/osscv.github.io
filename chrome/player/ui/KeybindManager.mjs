import {DefaultKeybinds, KeybindsWithModifiers} from '../options/defaults/DefaultKeybinds.mjs';
import {EventEmitter} from '../modules/eventemitter.mjs';
import {WebUtils} from '../utils/WebUtils.mjs';
import {DOMElements} from './DOMElements.mjs';

export class KeybindManager extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.keybindMap = new Map();
    this.setup();
  }
  setup() {
    for (const keybind in DefaultKeybinds) {
      if (Object.hasOwn(DefaultKeybinds, keybind)) {
        this.keybindMap.set(keybind, DefaultKeybinds[keybind]);
      }
    }

    DOMElements.playerContainer.addEventListener('keydown', (e) => {
      this.onKeyDown(e);
    });

    document.addEventListener('keydown', (e) => {
      this.onKeyDown(e);
    });

    this.on('HidePlayer', (e) => {
      this.client.interfaceController.toggleHide();
    });

    this.on('NextChapter', (e) =>{
      const chapters = this.client.chapters;
      const time = this.client.currentTime;
      const chapter = chapters.findIndex((chapter) => chapter.startTime <= time && chapter.endTime >= time);
      if (chapter === -1) {
        return;
      }

      if (chapter + 1 < chapters.length) {
        this.client.currentTime = chapters[chapter + 1].startTime;
      }
    });

    this.on('GoToStart', (e) => {
      this.client.currentTime = 0;
    });

    this.on('VolumeUp', (e) => {
      this.client.volume = Math.round(Math.min(this.client.volume + 0.10, 3) * 100) / 100;
    });

    this.on('VolumeDown', (e) => {
      this.client.volume = Math.round(Math.max(this.client.volume - 0.10, 0) * 100) / 100;
    });

    this.on('Mute', (e)=>{
      this.client.interfaceController.volumeControls.muteToggle();
    });

    this.on('SeekForward', (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += this.client.options.seekStepSize;
      this.client.setSeekSave(true);
    });

    this.on('SeekBackward', (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += -this.client.options.seekStepSize;
      this.client.setSeekSave(true);
    });

    const frameStep = 1 / 30;
    this.on('SeekForwardFrame', (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += frameStep;
      this.client.setSeekSave(true);
    });

    this.on('SeekBackwardFrame', (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += -frameStep;
      this.client.setSeekSave(true);
    });

    this.on('PlayPause', (e) => {
      this.client.interfaceController.playPauseToggle();
    });

    this.on('Fullscreen', (e) => {
      this.client.interfaceController.fullscreenToggle();
      this.client.interfaceController.hideControlBarOnAction(2000);
    });

    this.on('PictureInPicture', (e) => {
      this.client.interfaceController.pipToggle();
    });

    this.on('SeekForwardLarge', (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += this.client.options.seekStepSize * 5;
      this.client.setSeekSave(true);
    });

    this.on('SeekBackwardLarge', (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += -this.client.options.seekStepSize * 5;
      this.client.setSeekSave(true);
    });

    this.on('IncreasePlaybackRate', (e) => {
      this.client.playbackRate = Math.min(this.client.playbackRate + 0.1, 8);
    });

    this.on('DecreasePlaybackRate', (e) => {
      this.client.playbackRate = Math.max(this.client.playbackRate - 0.1, 0.1);
    });

    this.on('UndoSeek', (e) => {
      this.client.undoSeek();
    });

    this.on('RedoSeek', (e) => {
      this.client.redoSeek();
    });

    this.on('ResetFailed', (e) => {
      this.client.resetFailed();
    });

    this.on('RemoveDownloader', (e) => {
      if (this.client.downloadManager.downloaders.length > 0) {
        this.client.downloadManager.removeDownloader();
        this.client.interfaceController.updateFragmentsLoaded();
      }
    });

    this.on('AddDownloader', (e) => {
      if (!this.client.options.maximumDownloaders || this.client.downloadManager.downloaders.length < this.client.options.maximumDownloaders) {
        this.client.downloadManager.addDownloader();
        this.client.interfaceController.updateFragmentsLoaded();
      }
    });

    this.on('SkipIntroOutro', (e) => {
      this.client.interfaceController.skipSegment();
    });

    this.on('SubtrackShiftRight', (e) => {
      this.client.interfaceController.subtitlesManager.subtitleSyncer.shiftSubtitles(0.2);
    });

    this.on('SubtrackShiftLeft', (e) => {
      this.client.interfaceController.subtitlesManager.subtitleSyncer.shiftSubtitles(-0.2);
    });

    this.on('ToggleSubtitles', (e)=>{
      this.client.interfaceController.subtitlesManager.toggleSubtitles();
    });


    this.on('FlipVideo', (e) => {
      const options = this.client.options;
      options.videoFlip = (options.videoFlip + 1) % 4;
      this.client.updateCSSFilters();
    });

    this.on('RotateVideo', (e) => {
      const options = this.client.options;
      options.videoRotate = (options.videoRotate + 3) % 4;
      this.client.updateCSSFilters();
    });

    this.on('WindowedFullscreen', (e) => {
      this.client.interfaceController.toggleWindowedFullscreen();
    });

    this.on('NextVideo', (e) =>{
      this.client.nextVideo();
    });

    this.on('PreviousVideo', (e) =>{
      this.client.previousVideo();
    });

    this.on('SaveVideo', (e) => {
      this.client.interfaceController.saveManager.saveVideo(e);
    });

    this.on('Screenshot', (e) => {
      this.client.interfaceController.saveManager.saveScreenshot(e);
    });

    this.on('ToggleVisualFilters', (e) => {
      this.client.interfaceController.toggleVisualFilters();
    });

    this.on('PauseDownloaders', (e) => {
      if (!this.client.downloadManager.paused) {
        this.client.downloadManager.pause();
      } else {
        this.client.downloadManager.resume();
      }
    });

    this.on('keybind', (keybind, e) => {
      // console.log("Keybind", keybind);
    });
  }

  setKeybinds(keybinds) {
    for (const keybind in keybinds) {
      if (this.keybindMap.has(keybind)) {
        this.keybindMap.set(keybind, keybinds[keybind]);
      }
    }
  }

  eventToKeybind(e) {
    return this.eventToKeybinds(e)[0];
  }

  eventToKeybinds(e) {
    const keyString = WebUtils.getKeyString(e);
    return this.keyStringToKeybinds(keyString, e);
  }

  keyStringToKeybinds(keyString) {
    const modifiers = keyString.split('+');
    const baseKey = modifiers.pop();

    const results = [];
    for (const [key, value] of this.keybindMap.entries()) {
      if (value === keyString) {
        results.push(key);
      } else if (KeybindsWithModifiers.includes(key)) {
        const testModifiers = value.split('+');
        const testBase = testModifiers.pop();
        if (testBase === baseKey && testModifiers.every((mod) => modifiers.includes(mod))) {
          results.push(key);
        }
      }
    }
    return results;
  }

  handleKeyString(keyString, e) {
    const keybinds = this.keyStringToKeybinds(keyString);
    if (keybinds.length !== 0) {
      this.emit('keybind', keybinds, e);
      keybinds.forEach((keybind) => {
        this.emit(keybind, e);
      });
      return true;
    }
    return false;
  }

  onKeyDown(e) {
    const keyString = WebUtils.getKeyString(e);

    if (this.handleKeyString(keyString, e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}
