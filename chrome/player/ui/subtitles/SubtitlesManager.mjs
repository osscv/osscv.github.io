import {Localize} from '../../modules/Localize.mjs';
import {WebVTT} from '../../modules/vtt.mjs';
import {SubtitleTrack} from '../../SubtitleTrack.mjs';
import {RequestUtils} from '../../utils/RequestUtils.mjs';
import {SubtitleUtils} from '../../utils/SubtitleUtils.mjs';
import {Utils} from '../../utils/Utils.mjs';
import {WebUtils} from '../../utils/WebUtils.mjs';
import {DOMElements} from '../DOMElements.mjs';
import {OpenSubtitlesSearch, OpenSubtitlesSearchEvents} from './OpenSubtitlesSearch.mjs';
import {SubtitlesSettingsManager, SubtitlesSettingsManagerEvents} from './SubtitlesSettingsManager.mjs';

export class SubtitlesManager {
  constructor(client) {
    this.client = client;
    this.tracks = [];

    this.activeTracks = [];
    this.isTestSubtitleActive = false;

    this.subtitleTrackListElements = [];
    this.subtitleTrackDisplayElements = [];

    this.settingsManager = new SubtitlesSettingsManager();
    this.settingsManager.on(SubtitlesSettingsManagerEvents.SETTINGS_CHANGED, this.onSettingsChanged.bind(this));
    this.settingsManager.loadSettings();

    this.openSubtitlesSearch = new OpenSubtitlesSearch(client.version);
    this.openSubtitlesSearch.on(OpenSubtitlesSearchEvents.TRACK_DOWNLOADED, this.onSubtitleTrackDownloaded.bind(this));

    this.setupUI();
  }

  loadTrackAndActivateBest(subtitleTrack, autoset = false) {
    const returnedTrack = this.addTrack(subtitleTrack);
    if (returnedTrack !== subtitleTrack) {
      return returnedTrack;
    }

    const defLang = this.settingsManager.getSettings()['default-lang'];
    if (autoset && this.activeTracks.length === 0 && this.client.options.autoEnableBestSubtitles) {
      if (subtitleTrack.language && subtitleTrack.language.substring(0, defLang.length) === defLang) {
        this.activateTrack(subtitleTrack);
      }
    }

    return returnedTrack;
  }

  addTrack(track) {
    const existing = this.tracks.find((t) => t.equals(track));
    if (existing) {
      return existing;
    }

    this.tracks.push(track);

    this.updateTrackList();
    this.client.interfaceController.showControlBar();
    this.client.interfaceController.queueControlsHide(1000);

    return track;
  }

  activateTrack(track) {
    if (this.tracks.indexOf(track) === -1) {
      console.error('Cannot activate track that is not loaded', track);
      return;
    }

    if (this.activeTracks.indexOf(track) === -1) {
      this.activeTracks.push(track);
      this.updateTrackList();
    }
  }

  deactivateTrack(track) {
    const ind = this.activeTracks.indexOf(track);
    if (ind !== -1) {
      this.activeTracks.splice(ind, 1);
      this.updateTrackList();
    }
  }

  clearTracks() {
    this.tracks.length = 0;
    this.activeTracks.length = 0;
    this.updateTrackList();
    this.client.subtitleSyncer.stop();
  }

  removeTrack(track) {
    let ind = this.tracks.indexOf(track);
    if (ind !== -1) this.tracks.splice(ind, 1);
    ind = this.activeTracks.indexOf(track);
    if (ind !== -1) this.activeTracks.splice(ind, 1);
    this.updateTrackList();
    this.client.subtitleSyncer.toggleTrack(track, true);
  }

  onSettingsChanged(settings) {
    this.openSubtitlesSearch.setLanguageInputValue(settings['default-lang']);
    this.refreshSubtitleStyles();
    this.renderSubtitles();
    this.client.subtitleSyncer.onVideoTimeUpdate();
  }

  onSubtitleTrackDownloaded(track) {
    this.activateTrack(this.addTrack(track));
  }

  onCaptionsButtonInteract(e) {
    if (e.shiftKey) {
      this.openSubtitlesSearch.toggleUI();
      e.stopPropagation();
      return;
    }

    if (DOMElements.subtitlesMenu.style.display === 'none') {
      this.openUI();
    } else {
      this.closeUI();
    }
    e.stopPropagation();
  }

  closeUI() {
    DOMElements.subtitlesMenu.style.display = 'none';
  }

  openUI() {
    DOMElements.subtitlesMenu.style.display = '';
  }

  setupUI() {
    DOMElements.subtitles.addEventListener('click', this.onCaptionsButtonInteract.bind(this));
    DOMElements.subtitles.tabIndex = 0;

    DOMElements.subtitles.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeUI();
        e.stopPropagation();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        this.onCaptionsButtonInteract(e);
      }
    });


    DOMElements.playerContainer.addEventListener('click', (e) => {
      this.closeUI();
    });

    DOMElements.subtitlesOptionsTestButton.addEventListener('click', (e) => {
      this.isTestSubtitleActive = !this.isTestSubtitleActive;
      if (this.isTestSubtitleActive) {
        DOMElements.subtitlesOptionsTestButton.textContent = Localize.getMessage('player_subtitlesmenu_testbtn_stop');
        DOMElements.playerContainer.style.backgroundImage = 'linear-gradient(to right, black, white)';
      } else {
        DOMElements.subtitlesOptionsTestButton.textContent = Localize.getMessage('player_subtitlesmenu_testbtn');
        DOMElements.playerContainer.style.backgroundImage = '';
      }

      this.renderSubtitles();
      this.client.subtitleSyncer.onVideoTimeUpdate();
    });
    WebUtils.setupTabIndex(DOMElements.subtitlesOptionsTestButton);

    const filechooser = document.createElement('input');
    filechooser.type = 'file';
    filechooser.style.display = 'none';
    filechooser.accept = '.vtt, .srt';

    filechooser.addEventListener('change', () => {
      const files = filechooser.files;
      if (!files || !files[0]) return;
      const file = files[0];
      const name = file.name;
      //  var ext = name.substring(name.length - 4);

      const reader = new FileReader();
      reader.onload = () => {
        const dt = reader.result;
        const track = new SubtitleTrack(name, null);
        track.loadText(dt);

        this.addTrack(track);
      };
      reader.readAsText(file);
    });
    document.body.appendChild(filechooser);

    const filebutton = document.createElement('div');
    filebutton.classList.add('subtitle-menu-option');
    WebUtils.setupTabIndex(filebutton);
    filebutton.textContent = Localize.getMessage('player_subtitlesmenu_uploadbtn');

    filebutton.addEventListener('click', (e) => {
      filechooser.click();
    });
    DOMElements.subtitlesView.appendChild(filebutton);

    const urlbutton = document.createElement('div');
    urlbutton.classList.add('subtitle-menu-option');
    urlbutton.textContent = Localize.getMessage('player_subtitlesmenu_urlbtn');
    WebUtils.setupTabIndex(urlbutton);
    urlbutton.addEventListener('click', (e) => {
      const url = prompt(Localize.getMessage('player_subtitlesmenu_urlprompt'));

      if (url) {
        RequestUtils.requestSimple(url, (err, req, body) => {
          if (body) {
            const track = new SubtitleTrack('URL Track', null);
            track.loadText(body);

            this.addTrack(track);
          }
        });
      }
    });

    DOMElements.subtitlesView.appendChild(urlbutton);

    const internetbutton = document.createElement('div');
    internetbutton.textContent = Localize.getMessage('player_subtitlesmenu_searchbtn');
    internetbutton.classList.add('subtitle-menu-option');
    internetbutton.classList.add('disable-when-mini');
    WebUtils.setupTabIndex(internetbutton);
    internetbutton.addEventListener('click', (e) => {
      this.openSubtitlesSearch.toggleUI();
    });
    DOMElements.subtitlesView.appendChild(internetbutton);

    const clearbutton = document.createElement('div');
    clearbutton.textContent = Localize.getMessage('player_subtitlesmenu_clearbtn');
    WebUtils.setupTabIndex(clearbutton);
    clearbutton.classList.add('subtitle-menu-option');

    clearbutton.addEventListener('click', (e) => {
      this.clearTracks();
    });
    DOMElements.subtitlesView.appendChild(clearbutton);

    const optionsbutton = document.createElement('div');
    optionsbutton.classList.add('subtitle-menu-option');
    optionsbutton.textContent = Localize.getMessage('player_subtitlesmenu_settingsbtn');
    WebUtils.setupTabIndex(optionsbutton);

    optionsbutton.addEventListener('click', (e) => {
      this.settingsManager.showUI();
    });

    WebUtils.setupTabIndex(DOMElements.subtitlesOptionsBackButton);

    DOMElements.subtitlesView.appendChild(optionsbutton);

    DOMElements.subtitlesMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  }

  createTrackEntryElements(i) {
    const trackElement = document.createElement('div');
    trackElement.classList.add('subtitle-track-element');

    trackElement.addEventListener('click', (e) => {
      const track = this.tracks[i];
      const ind = this.activeTracks.indexOf(track);
      if (ind !== -1) {
        this.deactivateTrack(track);
      } else {
        this.activateTrack(track);
      }
      e.stopPropagation();
      e.preventDefault();
    });

    WebUtils.setupTabIndex(trackElement);

    const trackName = document.createElement('div');
    trackElement.appendChild(trackName);
    trackName.classList.add('subtitle-track-name');

    const resyncTool = document.createElement('div');
    resyncTool.title = Localize.getMessage('player_subtitlesmenu_resynctool_label');
    resyncTool.className = 'fluid_button fluid_button_wand subtitle-resync-tool';
    trackElement.appendChild(resyncTool);
    // svg use
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'assets/fluidplayer/static/icons.svg#hourglass');
    svg.appendChild(use);
    resyncTool.appendChild(svg);

    resyncTool.addEventListener('click', (e) => {
      this.client.subtitleSyncer.toggleTrack(this.tracks[i]);
      e.stopPropagation();
    }, true);

    const downloadTrack = document.createElement('div');
    downloadTrack.title = Localize.getMessage('player_subtitlesmenu_savetool_label');
    downloadTrack.className = 'fluid_button fluid_button_download subtitle-download-tool';

    // svg use
    const svg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use2 = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use2.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'assets/fluidplayer/static/icons.svg#download');
    svg2.appendChild(use2);
    downloadTrack.appendChild(svg2);

    trackElement.appendChild(downloadTrack);

    downloadTrack.addEventListener('click', (e) => {
      e.stopPropagation();
      const suggestedName = trackElement.textContent.replaceAll(' ', '_');
      const dlname = chrome?.extension?.inIncognitoContext ? suggestedName : prompt(Localize.getMessage('player_filename_prompt'), suggestedName);

      if (!dlname) {
        return;
      }

      const srt = SubtitleUtils.cuesToSrt(this.tracks[i].cues);
      const blob = new Blob([srt], {
        type: 'text/plain',
      });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = dlname + '.srt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, true);

    const removeTrack = document.createElement('div');
    removeTrack.classList.add('subtitle-remove-tool');
    removeTrack.title = Localize.getMessage('player_subtitlesmenu_removetool_label');
    trackElement.appendChild(removeTrack);

    removeTrack.addEventListener('click', (e) => {
      this.removeTrack(this.tracks[i]);
      e.stopPropagation();
    }, true);


    const shiftLTrack = document.createElement('div');
    shiftLTrack.classList.add('subtitle-shiftl-tool');
    shiftLTrack.title = Localize.getMessage('player_subtitlesmenu_shifttool_label', ['-0.2']);
    trackElement.appendChild(shiftLTrack);

    shiftLTrack.addEventListener('click', (e) => {
      this.tracks[i].shift(-0.2);
      this.renderSubtitles();
      this.client.subtitleSyncer.onVideoTimeUpdate();
      this.client.interfaceController.setStatusMessage('subtitles', Localize.getMessage('player_subtitlesmenu_shifttool_message', ['-0.2']), 'info', 700);
      e.stopPropagation();
    }, true);

    const shiftRTrack = document.createElement('div');
    shiftRTrack.classList.add('subtitle-shiftr-tool');
    shiftRTrack.title = Localize.getMessage('player_subtitlesmenu_shifttool_label', ['+0.2']);
    trackElement.appendChild(shiftRTrack);

    shiftRTrack.addEventListener('click', (e) => {
      this.tracks[i].shift(0.2);
      this.renderSubtitles();
      this.client.subtitleSyncer.onVideoTimeUpdate();
      this.client.interfaceController.setStatusMessage('subtitles', Localize.getMessage('player_subtitlesmenu_shifttool_message', ['+0.2']), 'info', 700);
      e.stopPropagation();
    }, true);


    trackElement.addEventListener('mouseenter', () => {
      trackElement.focus();
    });

    trackElement.addEventListener('mouseleave', () => {
      trackElement.blur();
    });


    trackElement.addEventListener('keydown', (e) => {
      const keybind = this.client.keybindManager.eventToKeybind(e);
      if (keybind === 'SubtrackDelete') {
        e.stopPropagation();
        removeTrack.click();
      } else if (keybind === 'SubtrackShiftRight') {
        e.stopPropagation();
        shiftRTrack.click();
      } else if (keybind === 'SubtrackShiftLeft') {
        e.stopPropagation();
        shiftLTrack.click();
      } else if (keybind === 'SubtrackDownload') {
        e.stopPropagation();
        downloadTrack.click();
      } else if (keybind === 'SubtrackToggleResync') {
        e.stopPropagation();
        resyncTool.click();
      }
    });

    return {
      trackElement,
      update: () => {
        const track = this.tracks[i];
        const activeIndex = this.activeTracks.indexOf(track);
        const nameCandidate = (track.language ? ('(' + track.language + ') ') : '') + (track.label || `Track ${i + 1}`);
        let name = nameCandidate;
        // limit to 30 chars
        if (name.length > 30) {
          name = name.substring(0, 30) + '...';
        }

        if (activeIndex !== -1) {
          trackElement.classList.add('subtitle-track-active');

          if (this.activeTracks.length > 1) {
            trackName.textContent = (activeIndex + 1) + ': ' + name;
          } else {
            trackName.textContent = name;
          }
        } else {
          trackElement.classList.remove('subtitle-track-active');
          trackName.textContent = name;
        }

        trackName.title = nameCandidate;
      },
    };
  }

  updateTrackList() {
    const cachedElements = this.subtitleTrackListElements;
    const tracks = this.tracks;

    // Remove extra elements
    for (let i = cachedElements.length - 1; i >= tracks.length; i--) {
      const el = cachedElements[i];
      el.trackElement.remove();
      cachedElements.splice(i, 1);
    }

    // Add new elements
    for (let i = cachedElements.length; i < tracks.length; i++) {
      const elements = this.createTrackEntryElements(i);
      cachedElements.push(elements);
      DOMElements.subtitlesList.appendChild(elements.trackElement);
    }

    // Update elements
    for (let i = 0; i < tracks.length; i++) {
      cachedElements[i].update();
    }

    this.renderSubtitles();
    this.client.subtitleSyncer.onVideoTimeUpdate();
  }

  applyStyles(trackContainer) {
    const settings = this.settingsManager.getSettings();
    trackContainer.style.color = settings.color;
    trackContainer.style.fontSize = settings['font-size'];
    trackContainer.style.backgroundColor = settings.background;
  }

  refreshSubtitleStyles() {
    this.subtitleTrackDisplayElements.forEach((el) => {
      this.applyStyles(el);
    });
  }

  renderSubtitles() {
    const cachedElements = this.subtitleTrackDisplayElements;
    const tracks = this.activeTracks;
    let trackLen = tracks.length;

    if (this.isTestSubtitleActive) {
      trackLen++;
    }

    // Remove extra elements
    for (let i = cachedElements.length - 1; i >= trackLen; i--) {
      const el = cachedElements[i];
      el.parentElement.remove();
      cachedElements.splice(i, 1);
    }

    // Add new elements
    for (let i = cachedElements.length; i < trackLen; i++) {
      const trackContainer = document.createElement('div');
      trackContainer.className = 'subtitle-track';
      this.applyStyles(trackContainer);

      const wrapper = document.createElement('div');
      wrapper.className = 'subtitle-track-wrapper';
      wrapper.appendChild(trackContainer);

      cachedElements.push(trackContainer);
      DOMElements.subtitlesContainer.appendChild(wrapper);
    }

    // Update elements
    const currentTime = this.client.persistent.currentTime;

    for (let i = 0; i < tracks.length; i++) {
      const trackContainer = cachedElements[i];
      trackContainer.replaceChildren();
      const cues = tracks[i].cues;
      let hasCues = false;

      let cueIndex = Utils.binarySearch(cues, this.client.persistent.currentTime, (time, cue) => {
        if (cue.startTime > time) {
          return -1;
        } else if (cue.endTime < time) {
          return 1;
        }
        return 0;
      });

      if (cueIndex > -1) {
        while (cueIndex > 0 && cues[cueIndex - 1].endTime >= currentTime && cues[cueIndex - 1].startTime <= currentTime) {
          cueIndex--;
        }

        while (cueIndex < cues.length && cues[cueIndex].endTime >= currentTime && cues[cueIndex].startTime <= currentTime) {
          const cue = cues[cueIndex];
          if (!cue.dom) {
            cue.dom = WebVTT.convertCueToDOMTree(window, cue.text);
          }
          hasCues = true;
          trackContainer.appendChild(cue.dom);
          cueIndex++;
        }
      }

      if (!hasCues) {
        trackContainer.style.opacity = 0;
        const fillerCue = document.createElement('div');
        trackContainer.appendChild(fillerCue);

        fillerCue.textContent = '|';
      } else {
        trackContainer.style.opacity = '';
      }
    }


    if (this.isTestSubtitleActive) {
      const trackContainer = cachedElements[trackLen - 1];
      trackContainer.replaceChildren();
      trackContainer.style.opacity = '';

      const cue = document.createElement('div');
      cue.textContent = Localize.getMessage('player_testsubtitle');
      trackContainer.appendChild(cue);
    }
  }

  mediaNameSet() {
    this.openSubtitlesSearch.setQueryInputValue(this.client.mediaName);
  }
}
