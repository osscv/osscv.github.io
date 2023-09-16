import {DefaultPlayerEvents} from '../../enums/DefaultPlayerEvents.mjs';
import {DownloadStatus} from '../../enums/DownloadStatus.mjs';
import {EmitterRelay, EventEmitter} from '../../modules/eventemitter.mjs';
import {Hls} from '../../modules/hls.mjs';
import {VideoUtils} from '../../utils/VideoUtils.mjs';
import {HLSFragment} from './HLSFragment.mjs';
import {HLSFragmentRequester} from './HLSFragmentRequester.mjs';
import {HLSLoaderFactory} from './HLSLoader.mjs';


export default class HLSPlayer extends EventEmitter {
  constructor(client, config) {
    super();
    this.client = client;
    this.isPreview = config?.isPreview || false;
    this.source = null;
    this.fragmentRequester = new HLSFragmentRequester(this);
    this.video = document.createElement('video');
    if (!Hls.isSupported()) {
      throw new Error('HLS Not supported');
    }

    this.hls = new Hls({
      autoStartLoad: false,
      startPosition: -1,
      debug: false,
      capLevelOnFPSDrop: false,
      capLevelToPlayerSize: true,
      defaultAudioCodec: undefined,
      initialLiveManifestSize: 1,
      maxBufferLength: 1,
      maxMaxBufferLength: 1,
      backBufferLength: 0,
      maxBufferSize: 0,
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxFragLookUpTolerance: 0.25,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: Infinity,
      liveDurationInfinity: false,
      enableWorker: true,
      enableSoftwareAES: true,
      startLevel: 5,
      startFragPrefetch: false,
      testBandwidth: false,
      progressive: false,
      lowLatencyMode: false,
      fpsDroppedMonitoringPeriod: 5000,
      fpsDroppedMonitoringThreshold: 0.2,
      appendErrorMaxRetry: 3,
      // eslint-disable-next-line new-cap
      loader: HLSLoaderFactory(this),
      enableDateRangeMetadataCues: true,
      enableEmsgMetadataCues: true,
      enableID3MetadataCues: true,
      enableWebVTT: true,
      enableIMSC1: true,
      enableCEA708Captions: true,
      stretchShortVideoTrack: false,
      maxAudioFramesDrift: 1,
      forceKeyFrameOnDiscontinuity: true,
      abrEwmaFastLive: 3.0,
      abrEwmaSlowLive: 9.0,
      abrEwmaFastVoD: 3.0,
      abrEwmaSlowVoD: 9.0,
      abrEwmaDefaultEstimate: 5000000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      abrMaxWithRealBitrate: false,
      maxStarvationDelay: 4,
      maxLoadingDelay: 4,
      minAutoBitrate: 0,
      emeEnabled: false,
      licenseXhrSetup: undefined,
      drmSystems: {},
      drmSystemOptions: {},
      // requestMediaKeySystemAccessFunc: requestMediaKeySystemAccess,
      cmcd: undefined,
    });
  }

  canSave() {
    const frags = this.client.getFragments(this.currentLevel);
    if (!frags) {
      return {
        canSave: false,
        isComplete: false,
      };
    }
    let incomplete = false;
    for (let i = 0; i < frags.length; i++) {
      if (frags[i] && frags[i].status !== DownloadStatus.DOWNLOAD_COMPLETE) {
        incomplete = true;
        break;
      }
    }

    return {
      canSave: this.readyState >= 3,
      isComplete: !incomplete,
    };
  }

  async getSaveBlob(options) {
    let frags = [];
    const fragments = this.client.getFragments(this.currentLevel) || [];
    const audioFragments = this.client.getFragments(this.currentAudioLevel) || [];

    let fragIndex = 0;
    let audioFragIndex = 0;

    for (let i = 0; i < fragments.length + audioFragments.length; i++) {
      const frag = fragments[fragIndex];
      const audioFrag = audioFragments[audioFragIndex];

      if (frag && audioFrag) {
        if (frag.start < audioFrag.start) {
          frags.push({
            type: 0,
            fragment: frag,
            entry: this.client.downloadManager.getEntry(frag.getContext()),
          });
          fragIndex++;
        } else {
          frags.push({
            type: 1,
            fragment: audioFrag,
            entry: this.client.downloadManager.getEntry(audioFrag.getContext()),
          });
          audioFragIndex++;
        }
      } else if (frag) {
        frags.push({
          type: 0,
          fragment: frag,
          entry: this.client.downloadManager.getEntry(frag.getContext()),
        });
        fragIndex++;
      } else if (audioFrag) {
        frags.push({
          type: 1,
          fragment: audioFrag,
          entry: this.client.downloadManager.getEntry(audioFrag.getContext()),
        });
        audioFragIndex++;
      }
    }

    frags = frags.filter((frag) => {
      return frag.fragment.status === DownloadStatus.DOWNLOAD_COMPLETE;
    });

    const level = this.hls.levels[this.getIndexes(this.currentLevel).levelID];
    const audioLevel = this.hls.audioTracks[this.hls.audioTrack];

    let levelInitData = null;
    let audioLevelInitData = null;

    if (fragments[-1]) {
      levelInitData = new Uint8Array(await this.client.downloadManager.getEntry(fragments[-1].getContext()).getDataFromBlob());
    }

    if (audioFragments[-1]) {
      audioLevelInitData = new Uint8Array(await this.client.downloadManager.getEntry(audioFragments[-1].getContext()).getDataFromBlob());
    }

    if (levelInitData && audioLevelInitData) {
      const {DASH2MP4} = await import('../../modules/dash2mp4/dash2mp4.mjs');

      const dash2mp4 = new DASH2MP4();

      dash2mp4.on('progress', (progress) => {
        if (options?.onProgress) {
          options.onProgress(progress);
        }
      });

      const blob = await dash2mp4.convert(level.details.totalduration, levelInitData.buffer, audioLevel.details.totalduration, audioLevelInitData.buffer, frags);

      return {
        extension: 'mp4',
        blob: blob,
      };
    } else {
      const {HLS2MP4} = await import('../../modules/hls2mp4/hls2mp4.mjs');
      const hls2mp4 = new HLS2MP4();

      hls2mp4.on('progress', (progress) => {
        if (options?.onProgress) {
          options.onProgress(progress);
        }
      });
      const blob = await hls2mp4.convert(level, levelInitData, audioLevel, audioLevelInitData, frags);

      return {
        extension: 'mp4',
        blob: blob,
      };
    }
  }

  load() {
    this.hls.startLoad();
  }

  getClient() {
    return this.client;
  }


  async setup() {
    this.hls.attachMedia(this.video);

    await new Promise((resolve, reject) => {
      this.hls.on(Hls.Events.MEDIA_ATTACHED, function() {
        resolve();
      });
    });

    const preEvents = new EventEmitter();
    const emitterRelay = new EmitterRelay([preEvents, this]);
    VideoUtils.addPassthroughEventListenersToVideo(this.video, emitterRelay);


    this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      let max = -1;
      let maxLevel = undefined;
      // Get best quality but within screen resolution
      this.levels.forEach((level, key) => {
        if (level.bitrate > max) {
          if (level.width > window.innerWidth * window.devicePixelRatio * 2 || level.height > window.innerHeight * window.devicePixelRatio * 2) return;
          max = level.bitrate;
          maxLevel = key;
        }
      });
      this.emit(DefaultPlayerEvents.MANIFEST_PARSED, maxLevel);
    });


    this.hls.on(Hls.Events.LEVEL_UPDATED, (a, data) => {
      this.trackUpdated(data.details, 0);
    });


    this.hls.on(Hls.Events.AUDIO_TRACK_UPDATED, (a, data) => {
      this.trackUpdated(data.details, 1);
    });
  }

  trackUpdated(levelDetails, trackID) {
    levelDetails.trackID = trackID;
    let time = 0;
    levelDetails.fragments.forEach((fragment, i) => {
      const identifier = this.getIdentifier(levelDetails.trackID, fragment.level);
      if (fragment.initSegment && i === 0) {
        fragment.initSegment.trackID = levelDetails.trackID;
        if (!this.client.getFragment(identifier, -1)) {
          this.client.makeFragment(identifier, -1, new HLSFragment(fragment.initSegment, 0, 0));
        }
      }
      if (fragment.encrypted) {
        fragment.fs_oldcryptdata = fragment.decryptdata;
        fragment.fs_oldlevelKeys = fragment.levelkeys;

        fragment.levelkeys = null;
        fragment._decryptdata = null;

        void fragment.decryptdata;
      }
      const start = time;
      time += fragment.duration;
      const end = time;
      fragment.levelIdentifier = identifier;
      fragment.trackID = levelDetails.trackID;
      if (!this.client.getFragment(identifier, fragment.sn)) {
        this.client.makeFragment(identifier, fragment.sn, new HLSFragment(fragment, start, end));
      }
    });
  }
  getVideo() {
    return this.video;
  }

  getIdentifier(trackID, levelID) {
    return `${trackID}:${levelID}`;
  }

  getIndexes(identifier) {
    const parts = identifier.split(':');
    return {
      trackID: parseInt(parts[0]),
      levelID: parseInt(parts[1]),
    };
  }

  async setSource(source) {
    this.source = source;
    this.hls.loadSource(source.url);
  }

  getSource() {
    return this.source;
  }

  downloadFragment(fragment) {
    this.fragmentRequester.requestFragment(fragment, {
      onProgress: (e) => {

      },
      onSuccess: (e) => {

      },
      onFail: (e) => {

      },

    });
  }


  get buffered() {
    return this.video.buffered;
  }

  async play() {
    return this.video.play();
  }

  async pause() {
    return this.video.pause();
  }

  destroy() {
    this.fragmentRequester.destroy();
    this.hls.destroy();
    this.emit(DefaultPlayerEvents.DESTROYED);
  }

  set currentTime(value) {
    this.video.currentTime = value;
  }

  get currentTime() {
    return this.video.currentTime;
  }

  get readyState() {
    return this.video.readyState;
  }

  get paused() {
    return this.video.paused;
  }

  get levels() {
    const result = new Map();
    this.hls.levels.forEach((level, index) => {
      result.set(this.getIdentifier(0, index), {
        width: level.width,
        height: level.height,
        bitrate: level.bitrate,
      });
    });

    return result;
  }

  get currentLevel() {
    return this.getIdentifier(0, this.hls.currentLevel);
  }

  set currentLevel(value) {
    this.hls.currentLevel = this.getIndexes(value).levelID;
  }

  get duration() {
    return this.video.duration;
  }

  get currentFragment() {
    if (!this.hls.streamController.currentFrag) return null;
    return this.client.getFragment(this.getIdentifier(0, this.hls.streamController.currentFrag.level), this.hls.streamController.currentFrag.sn);
  }

  get currentAudioLevel() {
    return this.getIdentifier(1, this.hls.audioTrack);
  }

  set currentAudioLevel(value) {
    this.hls.audioTrack = this.getIndexes(value).levelID;
  }

  get currentAudioFragment() {
    const frags = this.client.getFragments(this.currentAudioLevel);
    if (!frags) return null;

    const time = this.currentTime;
    return frags.find((frag) => {
      if (!frag) return false;
      return time >= frag.start && time < frag.end;
    });
  }

  get volume() {
    return this.video.volume;
  }

  set volume(value) {
    this.video.volume = value;
    if (value === 0) this.video.muted = true;
    else this.video.muted = false;
  }

  get playbackRate() {
    return this.video.playbackRate;
  }

  set playbackRate(value) {
    this.video.playbackRate = value;
  }
}