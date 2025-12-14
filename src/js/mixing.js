import { globals, separatorSystem } from "./globals.js";
import {
  panToPercent,
  positionToVolume,
  sendPanCommand,
  sendVolumeCommand,
  updateChannelMenuButtons,
  updatePanDisplay,
  volumeToDb,
} from "./utils.js";

/**
 * @type {Record<string | number, {
 *    current: number;
 *    target: number;
 *    lastUpdate: number;
 * }>}
 */
let vuSmoothing = {};
let panSliders = {};

export function createMasterChannel() {
  const mixerSection = document.getElementById("mixerSection");
  if (!mixerSection) return;

  const masterDiv = document.createElement("div");
  masterDiv.className = "channel-strip master";
  masterDiv.id = "masterChannel";
  masterDiv.dataset.trackIndex = "0";

  masterDiv.innerHTML = `
        <div class="channel-header" onclick="openChannelMenu(0)">
            <div class="channel-number">MASTER</div>
            <div class="channel-name">Главный</div>
            <button class="master-control-btn" onclick="toggleControlPanel(); event.stopPropagation();" title="Панель управления">
                ⚙️
            </button>
        </div>
        
        <div class="channel-fader">
            <div class="fader-track">
                <div class="fader-meter" id="masterMeter"></div>
                <div class="fader-knob" id="masterFader" style="bottom: 75%;"></div>
            </div>
            <div class="fader-value" id="masterFaderValue">0.0 dB</div>
        </div>
        
        <div class="channel-controls">
            <button class="channel-btn mute" onclick="toggleMasterMute()">
                <span class="channel-btn-icon">M</span>
                <span class="channel-btn-label">Mute</span>
            </button>
        </div>
        
        <button class="channel-menu-btn" onclick="openChannelMenu(0)">
            <span class="channel-btn-icon">⋮</span>
            <span class="channel-btn-label">Управление</span>
        </button>
    `;

  addFaderMarkers(masterDiv);

  if (globals.masterOnLeft) {
    mixerSection.prepend(masterDiv);
  } else {
    mixerSection.appendChild(masterDiv);
  }

  globals.masterChannel = masterDiv;
  initFader("masterFader", 1.0, "master");
}

/**
 *
 * @param {number} trackIndex
 * @param {import('./types.d.ts').TrackData} trackData
 */
export function createChannel(trackIndex, trackData) {
  const mixerSection = document.getElementById("mixerSection");
  if (!mixerSection) return;

  if (globals.channels[trackIndex]) {
    updateChannel(trackIndex, trackData);
    return;
  }

  const channelDiv = document.createElement("div");
  channelDiv.className = "channel-strip";
  channelDiv.dataset.trackIndex = trackIndex;
  channelDiv.id = `channel-${trackIndex}`;

  // Проверяем, скрыт ли трек
  if (globals.hiddenTracks[trackIndex]) {
    channelDiv.style.display = "none";
  }

  applyTrackColor(channelDiv, trackData.color);

  const trackName = trackData.name || `CH ${trackIndex}`;
  const volume = trackData.volume || 1.0;
  const pan = trackData.pan || 0;
  const peak = trackData.peak || 0;
  const isMuted = trackData.isMuted || false;
  const isSoloed = trackData.isSoloed || false;
  const isRecordArmed = trackData.isRecordArmed || false;

  const faderPos = volumeToPosition(volume);
  const meterHeight = Math.min(100, Math.max(0, (peak / 10 + 60) * (100 / 60)));

  channelDiv.innerHTML = `
        <div class="channel-header" onclick="openChannelMenu(${trackIndex})">
            <div class="channel-number">${trackIndex}</div>
            <div class="channel-name">${trackName}</div>
        </div>
        
        <div class="channel-fader">
            <div class="fader-track">
                <div class="fader-meter" id="meter-${trackIndex}"></div>
                <div class="fader-knob" id="fader-${trackIndex}" style="bottom: ${faderPos}%;"></div>
            </div>
            <div class="fader-value" id="faderValue-${trackIndex}">${volumeToDb(
              volume,
            )}</div>
        </div>
        
        <div class="channel-controls">
            <button class="channel-btn mute ${isMuted ? "active" : ""}" 
                    onclick="toggleMute(${trackIndex})">
                <span class="channel-btn-icon">M</span>
                <span class="channel-btn-label">Mute</span>
            </button>
            
            <button class="channel-btn solo ${isSoloed ? "active" : ""}" 
                    onclick="toggleSolo(${trackIndex})">
                <span class="channel-btn-icon">S</span>
                <span class="channel-btn-label">Solo</span>
            </button>
            
            <button class="channel-btn rec ${isRecordArmed ? "active" : ""}" 
                    onclick="toggleRecord(${trackIndex})">
                <span class="channel-btn-icon">R</span>
                <span class="channel-btn-label">Rec</span>
            </button>

            <button class="channel-btn fx vv1-fx-disabled" disabled
                    onclick="event.preventDefault(); event.stopPropagation();">
                <span class="channel-btn-icon">FX</span>
                <span class="channel-btn-label">FX</span>
            </button>
        </div>
        
        <div class="channel-pan">
            <div class="pan-label">Pan</div>
            <input type="range" class="pan-slider" 
                   min="-1" max="1" step="0.01" 
                   value="${pan}" 
                   id="panSlider-${trackIndex}">
            <div class="pan-value" id="panValue-${trackIndex}">${panToPercent(
              pan,
            )}</div>
        </div>
        
        <button class="channel-menu-btn" onclick="openChannelMenu(${trackIndex})">
            <span class="channel-btn-icon">⋮</span>
            <span class="channel-btn-label">Управление</span>
        </button>
    `;

  addFaderMarkers(channelDiv);
  insertChannelInOrder(channelDiv, trackIndex);

  globals.channels[trackIndex] = channelDiv;
  initFader(`fader-${trackIndex}`, volume, trackIndex);
  initPanSlider(`panSlider-${trackIndex}`, trackIndex);

  // Настройка drag & drop
  channelDiv.setAttribute("draggable", "true");
  channelDiv.style.cursor = "grab";

  channelDiv.addEventListener("dragstart", function (e) {
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({
        type: "track",
        trackId: trackIndex,
      }),
    );
    this.classList.add("dragging");
  });

  channelDiv.addEventListener("dragend", function () {
    this.classList.remove("dragging");
  });

  vuSmoothing[trackIndex] = {
    current: meterHeight,
    target: meterHeight,
    lastUpdate: Date.now(),
  };
}

/**
 *
 * @param {number} trackIndex
 * @param {import('./types.d.ts').TrackData} trackData
 */
export function updateChannel(trackIndex, trackData) {
  const channelDiv = globals.channels[trackIndex];
  if (!channelDiv) return;

  // Применяем видимость
  if (globals.hiddenTracks[trackIndex]) {
    channelDiv.style.display = "none";
  } else {
    // Проверяем, не находится ли трек в сепараторе
    let inSeparator = false;
    Object.values(separatorSystem.separators).forEach((separator) => {
      if (separator.tracks.includes(trackIndex)) {
        inSeparator = true;
      }
    });
    channelDiv.style.display = inSeparator ? "none" : "flex";
  }

  applyTrackColor(channelDiv, trackData.color);

  const nameElement = channelDiv.querySelector(".channel-name");
  if (nameElement) {
    nameElement.textContent = trackData.name || `CH ${trackIndex}`;
  }

  const volume = trackData.volume || 1.0;
  const faderKnob = document.getElementById(`fader-${trackIndex}`);
  if (faderKnob && !faderKnob.dataset.dragging) {
    const faderPos = volumeToPosition(volume);
    faderKnob.style.bottom = `${faderPos}%`;
  }

  const faderValue = document.getElementById(`faderValue-${trackIndex}`);
  if (faderValue) {
    faderValue.textContent = volumeToDb(volume);
  }

  const peak = trackData.peak || 0;
  const meterLevel = document.getElementById(`meter-${trackIndex}`);
  if (meterLevel) {
    const targetHeight = Math.min(
      100,
      Math.max(0, (peak / 10 + 60) * (100 / 60)),
    );

    if (!vuSmoothing[trackIndex]) {
      vuSmoothing[trackIndex] = {
        current: targetHeight,
        target: targetHeight,
        lastUpdate: Date.now(),
      };
    }

    vuSmoothing[trackIndex].target = targetHeight;

    if (!vuSmoothing[trackIndex].animationId) {
      animateVUMeter(trackIndex);
    }
  }

  const isMuted = trackData.isMuted || false;
  const isSoloed = trackData.isSoloed || false;
  const isRecordArmed = trackData.isRecordArmed || false;

  const muteBtn = channelDiv.querySelector(".channel-btn.mute");
  if (muteBtn) {
    muteBtn.classList.toggle("active", isMuted);
  }

  const soloBtn = channelDiv.querySelector(".channel-btn.solo");
  if (soloBtn) {
    soloBtn.classList.toggle("active", isSoloed);
  }

  const recBtn = channelDiv.querySelector(".channel-btn.rec");
  if (recBtn) {
    recBtn.classList.toggle("active", isRecordArmed);
  }

  const pan = trackData.pan || 0;
  const panSlider = document.getElementById(`panSlider-${trackIndex}`);
  if (panSlider && !panSlider.dataset.dragging) {
    panSlider.value = pan;

    const panValue = document.getElementById(`panValue-${trackIndex}`);
    if (panValue) {
      panValue.textContent = panToPercent(pan);
    }
  }

  // Обновляем меню
  if (globals.currentMenuChannel === trackIndex) {
    updateChannelMenuButtons(trackIndex);
  }
}

/**
 *
 * @param {import('./types.d.ts').TrackData} trackData
 */
export function updateMasterChannel(trackData) {
  if (!globals.masterChannel) return;

  const volume = trackData.volume || 1.0;
  const peak = trackData.peak || 0;
  const isMuted = trackData.isMuted || false;

  const faderKnob = document.getElementById("masterFader");
  if (faderKnob && !faderKnob.dataset.dragging) {
    const faderPos = volumeToPosition(volume);
    faderKnob.style.bottom = `${faderPos}%`;
  }

  const faderValue = document.getElementById("masterFaderValue");
  if (faderValue) {
    faderValue.textContent = volumeToDb(volume);
  }

  const meterLevel = document.getElementById("masterMeter");
  if (meterLevel) {
    const targetHeight = Math.min(
      100,
      Math.max(0, (peak / 10 + 60) * (100 / 60)),
    );

    if (!vuSmoothing["master"]) {
      vuSmoothing["master"] = {
        current: targetHeight,
        target: targetHeight,
        lastUpdate: Date.now(),
      };
    }

    vuSmoothing["master"].target = targetHeight;

    if (!vuSmoothing["master"].animationId) {
      animateMasterVUMeter();
    }
  }

  const muteBtn = globals.masterChannel.querySelector(".channel-btn.mute");
  if (muteBtn) {
    muteBtn.classList.toggle("active", isMuted);
  }

  if (globals.currentMenuChannel === 0) {
    updateChannelMenuButtons(0);
  }
}

function animateVUMeter(trackIndex) {
  if (!vuSmoothing[trackIndex]) return;

  const smoothing = vuSmoothing[trackIndex];
  const now = Date.now();

  const smoothingFactor = 0.3;
  smoothing.current =
    smoothing.current +
    (smoothing.target - smoothing.current) * smoothingFactor;

  const meterLevel = document.getElementById(`meter-${trackIndex}`);
  if (meterLevel) {
    meterLevel.style.height = `${smoothing.current}%`;
  }

  smoothing.lastUpdate = now;

  if (Math.abs(smoothing.current - smoothing.target) > 0.5) {
    smoothing.animationId = requestAnimationFrame(() =>
      animateVUMeter(trackIndex),
    );
  } else {
    smoothing.animationId = null;
  }
}

export function animateMasterVUMeter() {
  if (!vuSmoothing["master"]) return;

  const smoothing = vuSmoothing["master"];
  const now = Date.now();

  const smoothingFactor = 0.3;
  smoothing.current =
    smoothing.current +
    (smoothing.target - smoothing.current) * smoothingFactor;

  const meterLevel = document.getElementById("masterMeter");
  if (meterLevel) {
    meterLevel.style.height = `${smoothing.current}%`;
  }

  smoothing.lastUpdate = now;

  if (Math.abs(smoothing.current - smoothing.target) > 0.5) {
    smoothing.animationId = requestAnimationFrame(() => animateMasterVUMeter());
  } else {
    smoothing.animationId = null;
  }
}

export function insertChannelInOrder(channelDiv, trackIndex) {
  const mixerSection = document.getElementById("mixerSection");
  if (!mixerSection) return;

  const allChannels = Array.from(
    mixerSection.querySelectorAll(".channel-strip:not(.master)"),
  );

  let insertBeforeElement = null;
  for (let i = 0; i < allChannels.length; i++) {
    const channel = allChannels[i];
    const existingIndex = parseInt(channel.dataset.trackIndex);

    if (existingIndex > trackIndex) {
      insertBeforeElement = channel;
      break;
    }
  }

  if (insertBeforeElement) {
    mixerSection.insertBefore(channelDiv, insertBeforeElement);
  } else {
    if (!globals.masterOnLeft && globals.masterChannel) {
      mixerSection.insertBefore(channelDiv, globals.masterChannel);
    } else {
      mixerSection.appendChild(channelDiv);
    }
  }
}

function initPanSlider(sliderId, trackIndex) {
  const slider = document.getElementById(sliderId);
  if (!slider) return;

  let isDragging = false;
  let lastSendTime = 0;
  const sendInterval = 50;

  slider.addEventListener("mousedown", () => {
    isDragging = true;
    slider.dataset.dragging = "true";
    document.addEventListener("mousemove", handlePanDrag);
    document.addEventListener("mouseup", stopPanDrag);
  });

  slider.addEventListener("touchstart", () => {
    isDragging = true;
    slider.dataset.dragging = "true";
    document.addEventListener("touchmove", handlePanTouchDrag, {
      passive: false,
    });
    document.addEventListener("touchend", stopPanDrag);
    document.addEventListener("touchcancel", stopPanDrag);
  });

  function handlePanDrag(e) {
    if (!isDragging) return;

    const rect = slider.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const value = percent * 2 - 1;

    slider.value = value;
    updatePanDisplay(trackIndex, value);

    const now = Date.now();
    if (now - lastSendTime > sendInterval) {
      sendPanCommand(trackIndex, value);
      lastSendTime = now;
    }
  }

  function handlePanTouchDrag(e) {
    if (!isDragging) return;

    const rect = slider.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const value = percent * 2 - 1;

    slider.value = value;
    updatePanDisplay(trackIndex, value);

    const now = Date.now();
    if (now - lastSendTime > sendInterval) {
      sendPanCommand(trackIndex, value);
      lastSendTime = now;
    }

    e.preventDefault();
  }

  function stopPanDrag() {
    if (!isDragging) return;
    isDragging = false;
    slider.dataset.dragging = "false";

    sendPanCommand(trackIndex, parseFloat(slider.value));

    document.removeEventListener("mousemove", handlePanDrag);
    document.removeEventListener("touchmove", handlePanTouchDrag);
    document.removeEventListener("mouseup", stopPanDrag);
    document.removeEventListener("touchend", stopPanDrag);
    document.removeEventListener("touchcancel", stopPanDrag);
  }

  // Обработка input
  slider.addEventListener("input", function () {
    updatePanDisplay(trackIndex, this.value);

    if (!isDragging) {
      clearTimeout(panSliders[trackIndex]);
      panSliders[trackIndex] = setTimeout(() => {
        sendPanCommand(trackIndex, parseFloat(this.value));
      }, 100);
    }
  });
}

function initFader(faderId, initialValue, trackId) {
  const fader = document.getElementById(faderId);
  if (!fader) return;

  let isDragging = false;
  let startY = 0;
  let startBottom = 0;
  let lastSendTime = 0;
  const sendInterval = 50; // Увеличили частоту отправки

  fader.addEventListener("click", function (e) {
    if (e.detail === 2) {
      // Двойной клик
      const newBottom = 75; // 0 dB
      this.style.bottom = `${newBottom}%`;

      const volume = positionToVolume(newBottom);
      updateFaderDisplay(trackId, volume);

      sendVolumeCommand(trackId, volume);
    }
  });

  fader.addEventListener("mousedown", startDrag);
  fader.addEventListener("touchstart", startTouchDrag);

  function startDrag(e) {
    isDragging = true;
    fader.dataset.dragging = "true";
    startY = e.clientY;
    startBottom = parseFloat(fader.style.bottom) || 75;
    e.preventDefault();

    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", stopDrag);
  }

  function startTouchDrag(e) {
    isDragging = true;
    fader.dataset.dragging = "true";
    startY = e.touches[0].clientY;
    startBottom = parseFloat(fader.style.bottom) || 75;
    e.preventDefault();

    document.addEventListener("touchmove", handleTouchDrag, { passive: false });
    document.addEventListener("touchend", stopDrag);
    document.addEventListener("touchcancel", stopDrag);
  }

  function handleDrag(e) {
    if (!isDragging) return;

    const deltaY = startY - e.clientY;
    const trackHeight = fader.parentElement.getBoundingClientRect().height;
    const deltaPercent = (deltaY / trackHeight) * 100;
    const newBottom = Math.max(0, Math.min(100, startBottom + deltaPercent));

    fader.style.bottom = `${newBottom}%`;

    const volume = positionToVolume(newBottom);
    updateFaderDisplay(trackId, volume);

    const now = Date.now();
    if (now - lastSendTime > sendInterval) {
      sendVolumeCommand(trackId, volume);
      lastSendTime = now;
    }
  }

  function handleTouchDrag(e) {
    if (!isDragging) return;

    const deltaY = startY - e.touches[0].clientY;
    const trackHeight = fader.parentElement.getBoundingClientRect().height;
    const deltaPercent = (deltaY / trackHeight) * 100;
    const newBottom = Math.max(0, Math.min(100, startBottom + deltaPercent));

    fader.style.bottom = `${newBottom}%`;

    const volume = positionToVolume(newBottom);
    updateFaderDisplay(trackId, volume);

    const now = Date.now();
    if (now - lastSendTime > sendInterval) {
      sendVolumeCommand(trackId, volume);
      lastSendTime = now;
    }

    e.preventDefault();
  }

  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    fader.dataset.dragging = "false";

    const finalBottom = parseFloat(fader.style.bottom) || 75;
    const volume = positionToVolume(finalBottom);

    sendVolumeCommand(trackId, volume);

    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("touchmove", handleTouchDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("touchend", stopDrag);
    document.removeEventListener("touchcancel", stopDrag);
  }
}

function updateFaderDisplay(trackId, volume) {
  const faderValue =
    trackId === "master"
      ? document.getElementById("masterFaderValue")
      : document.getElementById(`faderValue-${trackId}`);

  if (faderValue) {
    faderValue.textContent = volumeToDb(volume);
  }
}

function volumeToPosition(volume) {
  if (volume <= 0.00000001) return 0;
  const dB = Math.log(volume) * 8.68588963806;
  return Math.max(0, Math.min(100, (dB + 60) * (75 / 60)));
}

function applyTrackColor(channelDiv, colorValue) {
  if (!colorValue || colorValue === "0" || colorValue === "0x0") {
    channelDiv.style.borderColor = "";
    channelDiv.classList.remove("color-track");
    return;
  }

  try {
    let colorStr = colorValue.toString().toLowerCase().replace("0x", "");
    if (!/^[0-9a-f]{6,8}$/i.test(colorStr)) return;

    const colorInt = parseInt(colorStr, 16);
    if (isNaN(colorInt)) return;

    let r,
      g,
      b,
      a = 1;

    if (colorStr.length === 8) {
      a = ((colorInt >> 24) & 0xff) / 255;
      r = (colorInt >> 16) & 0xff;
      g = (colorInt >> 8) & 0xff;
      b = colorInt & 0xff;
    } else {
      r = (colorInt >> 16) & 0xff;
      g = (colorInt >> 8) & 0xff;
      b = colorInt & 0xff;
    }

    const color =
      a < 0.1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;

    channelDiv.style.borderColor = color;
    channelDiv.classList.add("color-track");

    const header = channelDiv.querySelector(".channel-header");
    if (header) {
      header.style.background = `linear-gradient(to bottom, 
                rgba(${r}, ${g}, ${b}, 0.15) 0%, 
                rgba(0, 0, 0, 0.3) 100%)`;
      header.style.borderBottomColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
    }
  } catch (e) {
    console.warn("Ошибка применения цвета:", e);
  }
}

function addFaderMarkers(channelDiv) {
  const faderTrack = channelDiv.querySelector(".fader-track");
  if (!faderTrack || faderTrack.querySelector(".fader-marker")) return;

  const markers = [
    { pos: 0, label: "-∞", thick: false },
    { pos: 30, label: "-30", thick: false },
    { pos: 50, label: "-10", thick: false },
    { pos: 75, label: "0", thick: true },
    { pos: 90, label: "+10", thick: false },
    { pos: 100, label: "+20", thick: false },
  ];

  markers.forEach((marker) => {
    const markerEl = document.createElement("div");
    markerEl.className = `fader-marker ${marker.thick ? "thick" : ""}`;
    markerEl.style.top = `${100 - marker.pos}%`;

    if (marker.thick) {
      const label = document.createElement("div");
      label.className = "fader-label";
      label.textContent = marker.label;
      markerEl.appendChild(label);
    }

    faderTrack.appendChild(markerEl);
  });
}
