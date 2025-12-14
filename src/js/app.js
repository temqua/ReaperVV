import { sendCommand } from "./client.js";
import { globals, separatorSystem } from "./globals.js";
import { createMasterChannel } from "./mixing.js";
import {
  checkConnection,
  panToPercent,
  positionToVolume,
  sendPanCommand,
  sendVolumeCommand,
  updateChannelMenuButtons,
  updatePanDisplay,
  volumeToDb,
} from "./utils.js";
// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let autoUpdateEnabled = true;
let masterChannelVisible = true;

// === СИСТЕМА СЕПАРАТОРОВ ===
function updateSeparatorUI() {
  const countElement = document.getElementById("separatorCount");
  if (countElement) {
    countElement.textContent = Object.keys(separatorSystem.separators).length;
  }

  const syncText = document.getElementById("separatorSyncText");
  if (syncText) {
    syncText.textContent = separatorSystem.syncWithReaper ? "ВКЛ" : "ВЫКЛ";
  }
}

function createNewSeparator(name = "Группа") {
  const id = `sep_${separatorSystem.nextId++}`;

  separatorSystem.separators[id] = {
    id: id,
    name: name,
    tracks: [],
    createdAt: Date.now(),
    collapsed: false,
  };

  saveSeparators();
  createSeparatorElement(id);
  updateSeparatorUI();

  console.log(`✅ Создан сепаратор: ${name} (${id})`);
  return id;
}

function editSeparator(separatorId) {
  const separator = separatorSystem.separators[separatorId];
  if (!separator) return;

  const newName = prompt("Название сепаратора:", separator.name);
  if (newName !== null && newName.trim() !== "") {
    separator.name = newName.trim();

    const separatorEl = document.querySelector(
      `[data-separator-id="${separatorId}"]`,
    );
    if (separatorEl) {
      const titleEl = separatorEl.querySelector(".separator-title");
      if (titleEl) titleEl.textContent = separator.name;
    }

    saveSeparators();
  }
}

function toggleSeparatorCollapse(separatorId) {
  const separator = separatorSystem.separators[separatorId];
  if (!separator) return;

  separator.collapsed = !separator.collapsed;

  const separatorEl = document.querySelector(
    `[data-separator-id="${separatorId}"]`,
  );
  if (separatorEl) {
    const contentEl = separatorEl.querySelector(".separator-content");
    if (contentEl) {
      contentEl.style.display = separator.collapsed ? "none" : "block";
    }
  }

  saveSeparators();
}

function expandAllInSeparator(separatorId) {
  const separator = separatorSystem.separators[separatorId];
  if (!separator) return;

  separator.tracks.forEach((trackId) => {
    const channelDiv = globals.channels[trackId];
    if (channelDiv) {
      channelDiv.style.display = "flex";
    }
  });

  showMessage(`Треки из "${separator.name}" показаны`, "info");
}

function collapseAllInSeparator(separatorId) {
  const separator = separatorSystem.separators[separatorId];
  if (!separator) return;

  separator.tracks.forEach((trackId) => {
    const channelDiv = globals.channels[trackId];
    if (channelDiv) {
      channelDiv.style.display = "none";
    }
  });

  showMessage(`Треки из "${separator.name}" скрыты`, "info");
}

function clearAllSeparators() {
  if (!confirm("Удалить все сепараторы и вернуть треки в микшер?")) return;

  // Показываем все треки
  Object.values(separatorSystem.separators).forEach((separator) => {
    separator.tracks.forEach((trackId) => {
      const channelDiv = globals.channels[trackId];
      if (channelDiv) {
        channelDiv.style.display = "flex";
      }
    });
  });

  // Удаляем сепараторы из DOM
  document.querySelectorAll(".simple-separator").forEach((el) => el.remove());

  // Очищаем данные
  separatorSystem.separators = {};
  separatorSystem.nextId = 1;

  // Сохраняем и обновляем UI
  saveSeparators();
  updateSeparatorUI();

  showMessage("Все сепараторы очищены", "info");
}

function toggleSeparatorSync() {
  separatorSystem.syncWithReaper = !separatorSystem.syncWithReaper;
  updateSeparatorUI();
  saveSeparators();
  showMessage(
    `Синхронизация с REAPER: ${
      separatorSystem.syncWithReaper ? "ВКЛ" : "ВЫКЛ"
    }`,
    "info",
  );
}

function saveSeparators() {
  try {
    const data = {
      separators: separatorSystem.separators,
      nextId: separatorSystem.nextId,
    };
    localStorage.setItem("vv1_separators", JSON.stringify(data));
    localStorage.setItem(
      "vv1_separator_system",
      JSON.stringify({
        enabled: separatorSystem.enabled,
        syncWithReaper: separatorSystem.syncWithReaper,
      }),
    );
  } catch (e) {
    console.error("Ошибка сохранения сепараторов:", e);
  }
}

// === ФУНКЦИИ УПРАВЛЕНИЯ ТРЕКАМИ ===
function toggleMute(trackIndex) {
  sendCommand(`SET/TRACK/${trackIndex}/MUTE/-1`);
  if (globals.currentMenuChannel === trackIndex) {
    setTimeout(() => updateChannelMenuButtons(trackIndex), 50);
  }
}

function toggleSolo(trackIndex) {
  sendCommand(`SET/TRACK/${trackIndex}/SOLO/-1`);
  if (globals.currentMenuChannel === trackIndex) {
    setTimeout(() => updateChannelMenuButtons(trackIndex), 50);
  }
}

function toggleRecord(trackIndex) {
  sendCommand(`SET/TRACK/${trackIndex}/RECARM/-1`);
  if (globals.currentMenuChannel === trackIndex) {
    setTimeout(() => updateChannelMenuButtons(trackIndex), 50);
  }
}

function toggleMasterMute() {
  sendCommand(`SET/TRACK/0/MUTE/-1`);
  if (globals.currentMenuChannel === 0) {
    setTimeout(() => updateChannelMenuButtons(0), 50);
  }
}

/**
 *
 * @param {number} trackIndex
 * @param {number} value
 */
function setPan(trackIndex, value) {
  sendCommand(`SET/TRACK/${trackIndex}/PAN/${value}`);
}

function resetPan(trackIndex) {
  /** @type {HTMLInputElement} */
  const panSlider = document.getElementById(`panSlider-${trackIndex}`);
  if (panSlider) {
    panSlider.value = 0;
    updatePanDisplay(trackIndex, 0);
    setPan(trackIndex, 0);
  }
}

// === ТРАНСПОРТНЫЕ ФУНКЦИИ ===
function transportPlay() {
  sendCommand("1007");
  updateStatus("Воспроизведение", "#4CAF50");
}

function transportStop() {
  sendCommand("1008");
  updateStatus("Остановлен", "#FF9800");
}

function transportRecord() {
  sendCommand("1013");
  updateStatus("Запись", "#F44336");
}

function transportPause() {
  sendCommand("1008");
  updateStatus("Пауза", "#FF9800");
}

function transportRewind() {
  sendCommand("1016");
}

function transportFastForward() {
  sendCommand("1017");
}

// === ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ===
function saveProject() {
  sendCommand("SET/PROJEXTSTATE/backup/session/auto");
  showMessage("Проект сохранен", "info");
}

function undoAction() {
  sendCommand("40029");
}

function toggleMetronome() {
  sendCommand("1157");
}

function toggleRepeat() {
  sendCommand("SET/REPEAT/-1");
}

function refreshAll() {
  sendCommand("TRANSPORT");
  sendCommand("TRACK");
  showMessage("Данные обновлены", "info");
}

function toggleAutoUpdate() {
  autoUpdateEnabled = !autoUpdateEnabled;
  const textElement = document.getElementById("autoUpdateText");
  textElement.textContent = autoUpdateEnabled ? "ВКЛ" : "ВЫКЛ";
  showMessage(`Автообновление: ${autoUpdateEnabled ? "ВКЛ" : "ВЫКЛ"}`, "info");
  saveSettings();
}

function showHelp() {
  showMessage("Используйте кнопку на мастер-канале для управления", "info");
}

function resetConnection() {
  location.reload();
}

// === СИСТЕМНЫЕ ФУНКЦИИ ===
function startSystem() {
  console.log("Запуск системы...");
  updateStatus("Подключение...", "#FF9800");

  loadSettings();
  initSeparatorSystem();

  checkConnection();
  startPolling();

  setupMenuSliders();
}

function startPolling() {
  setInterval(() => {
    if (autoUpdateEnabled && globals.isConnected) {
      sendCommand("TRANSPORT");
    }
  }, 200);

  setInterval(() => {
    if (autoUpdateEnabled && globals.isConnected) {
      sendCommand("TRACK");
    }
  }, 150);
}

/**
 *
 * @param {string} message
 * @param {string} color
 */
function updateStatus(message, color) {
  const text = document.getElementById("statusText");
  if (text) {
    text.textContent = message;
    text.style.color = color;

    setTimeout(() => {
      if (globals.isConnected) {
        text.textContent = "Подключено";
        text.style.color = "#4CAF50";
      } else {
        text.textContent = "Отключено";
        text.style.color = "#F44336";
      }
    }, 2000);
  }
}

/**
 *
 * @param {string} message
 * @param {string} type
 */
function showMessage(message, type) {
  updateStatus(message, type === "info" ? "#2196F3" : "#F44336");
}

// === UI ФУНКЦИИ ===
function toggleControlPanel() {
  const panel = document.getElementById("controlPanel");
  panel.classList.toggle("active");
}

let isFullscreen = false;

function toggleFullscreen() {
  const elem = document.documentElement;

  if (!isFullscreen) {
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

function handleFullscreenChange() {
  isFullscreen = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );

  if (isFullscreen) {
    console.log("Полноэкранный режим включен");
  } else {
    console.log("Полноэкранный режим выключен");
  }
}

function toggleMasterChannel() {
  masterChannelVisible = !masterChannelVisible;
  const textElement = document.getElementById("masterToggleText");
  textElement.textContent = masterChannelVisible ? "ВКЛ" : "ВЫКЛ";

  const floatingBtn = document.getElementById("floatingSettingsBtn");

  if (masterChannelVisible) {
    if (globals.masterChannel) globals.masterChannel.style.display = "flex";
    floatingBtn.style.display = "none";
  } else {
    if (globals.masterChannel) globals.masterChannel.style.display = "none";
    floatingBtn.style.display = "flex";
  }

  saveSettings();
}

function toggleMasterPosition() {
  globals.masterOnLeft = !globals.masterOnLeft;
  const textElement = document.getElementById("masterPositionText");
  textElement.textContent = globals.masterOnLeft ? "Слева" : "Справа";

  moveMasterChannel();
  saveSettings();
}

function moveMasterChannel() {
  /** @type {HTMLDivElement} */
  const mixerSection = document.getElementById("mixerSection");
  if (!globals.masterChannel || !mixerSection) return;

  globals.masterChannel.remove();

  if (globals.masterOnLeft) {
    mixerSection.prepend(globals.masterChannel);
  } else {
    mixerSection.appendChild(globals.masterChannel);
  }
}

function setupSwipeToClose() {
  /** @type {HTMLDivElement} */
  const panel = document.getElementById("controlPanel");
  let startX = 0;
  let startY = 0;

  panel.addEventListener("touchstart", function (e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  });

  panel.addEventListener("touchmove", function (e) {
    if (!startX || !startY) return;

    const diffX = e.touches[0].clientX - startX;
    const diffY = e.touches[0].clientY - startY;

    if (diffX > 100 && Math.abs(diffY) < 50) {
      toggleControlPanel();
      startX = 0;
      startY = 0;
    }
  });

  panel.addEventListener("touchend", function () {
    startX = 0;
    startY = 0;
  });
}

// === НАСТРОЙКИ И ЛОКАЛЬНОЕ ХРАНИЛИЩЕ ===
function saveSettings() {
  const settings = {
    autoUpdateEnabled: autoUpdateEnabled,
    masterOnLeft: globals.masterOnLeft,
    masterChannelVisible: masterChannelVisible,
    hiddenTracks: globals.hiddenTracks,
  };
  localStorage.setItem("reaperVV_settings", JSON.stringify(settings));
}

function loadSettings() {
  const savedSettings = localStorage.getItem("reaperVV_settings");
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);

      autoUpdateEnabled =
        settings.autoUpdateEnabled !== undefined
          ? settings.autoUpdateEnabled
          : true;
      globals.masterOnLeft =
        settings.masterOnLeft !== undefined ? settings.masterOnLeft : true;
      masterChannelVisible =
        settings.masterChannelVisible !== undefined
          ? settings.masterChannelVisible
          : true;
      globals.hiddenTracks = settings.hiddenTracks || {};

      const autoUpdateText = document.getElementById("autoUpdateText");
      if (autoUpdateText) {
        autoUpdateText.textContent = autoUpdateEnabled ? "ВКЛ" : "ВЫКЛ";
      }

      const masterToggleText = document.getElementById("masterToggleText");
      if (masterToggleText) {
        masterToggleText.textContent = masterChannelVisible ? "ВКЛ" : "ВЫКЛ";
      }

      const masterPositionText = document.getElementById("masterPositionText");
      if (masterPositionText) {
        masterPositionText.textContent = globals.masterOnLeft
          ? "Слева"
          : "Справа";
      }

      const floatingBtn = document.getElementById("floatingSettingsBtn");
      if (globals.masterChannel) {
        globals.masterChannel.style.display = masterChannelVisible
          ? "flex"
          : "none";
      }
      floatingBtn.style.display = masterChannelVisible ? "none" : "flex";
    } catch (e) {
      console.error("Ошибка загрузки настроек:", e);
    }
  }
}

// === МЕНЮ КАНАЛА ===
/**
 *
 * @param {number} trackIndex
 */
function openChannelMenu(trackIndex) {
  globals.currentMenuChannel = trackIndex;
  const channelDiv =
    globals.channels[trackIndex] ||
    (trackIndex === 0 ? globals.masterChannel : null);
  if (!channelDiv) return;

  const trackName = channelDiv.querySelector(".channel-name").textContent;
  const menuTitle = trackIndex === 0 ? "MASTER" : `Канал ${trackIndex}`;

  document.getElementById("channelMenuTitle").textContent =
    `${menuTitle}: ${trackName}`;

  /** @type {HTMLDivElement} */
  const menuControls = document.getElementById("channelMenuControls");
  menuControls.innerHTML = "";

  const buttons = [
    { id: "mute", label: "Mute", icon: "M" },
    { id: "solo", label: "Solo", icon: "S" },
    { id: "rec", label: "Rec", icon: "R" },
  ];

  buttons.forEach((btn) => {
    if (trackIndex === 0 && (btn.id === "solo" || btn.id === "rec")) {
      return;
    }

    const button = document.createElement("button");
    button.className = `channel-btn ${btn.id}`;

    if (trackIndex === 0 && btn.id === "mute") {
      button.setAttribute("onclick", "toggleMasterMute()");
    } else if (btn.id === "mute") {
      button.setAttribute("onclick", `toggleMute(${trackIndex})`);
    } else if (btn.id === "solo") {
      button.setAttribute("onclick", `toggleSolo(${trackIndex})`);
    } else if (btn.id === "rec") {
      button.setAttribute("onclick", `toggleRecord(${trackIndex})`);
    }

    const isActive = channelDiv
      .querySelector(`.channel-btn.${btn.id}`)
      ?.classList.contains("active");
    if (isActive) {
      button.classList.add("active");
    }

    button.innerHTML = `
            <span class="channel-btn-icon">${btn.icon}</span>
            <span class="channel-btn-label">${btn.label}</span>
        `;

    menuControls.appendChild(button);
  });

  const closeButton = document.createElement("button");
  closeButton.className = "channel-btn";
  closeButton.setAttribute("onclick", "closeChannelMenu()");
  closeButton.style.gridColumn = "span 2";
  closeButton.innerHTML = `
        <span class="channel-btn-icon">✕</span>
        <span class="channel-btn-label">Закрыть</span>
    `;
  menuControls.appendChild(closeButton);

  updateChannelMenuButtons(trackIndex);

  document.getElementById("channelMenuOverlay").style.display = "flex";
}

function closeChannelMenu() {
  document.getElementById("channelMenuOverlay").style.display = "none";
  globals.currentMenuChannel = null;
}

function setupMenuSliders() {
  /** @type {HTMLInputElement} */
  const menuVolumeSlider = document.getElementById("channelMenuVolumeSlider");
  /** @type {HTMLInputElement} */
  const menuVolumeValue = document.getElementById("channelMenuVolumeValue");
  /** @type {HTMLInputElement} */
  const menuPanSlider = document.getElementById("channelMenuPanSlider");
  /** @type {HTMLInputElement} */
  const menuPanValue = document.getElementById("channelMenuPanValue");

  if (menuVolumeSlider && menuVolumeValue) {
    let isDragging = false;
    let lastSendTime = 0;
    const sendInterval = 50;

    menuVolumeSlider.addEventListener("mousedown", function () {
      isDragging = true;
      lastSendTime = Date.now();
    });

    menuVolumeSlider.addEventListener("touchstart", function () {
      isDragging = true;
      lastSendTime = Date.now();
    });

    const handleVolumeChange = function (value) {
      const volume = positionToVolume(parseFloat(value));
      menuVolumeValue.textContent = volumeToDb(volume);

      if (globals.currentMenuChannel !== null) {
        const faderId =
          globals.currentMenuChannel === 0
            ? "masterFader"
            : `fader-${globals.currentMenuChannel}`;
        const fader = document.getElementById(faderId);
        if (fader) {
          fader.style.bottom = `${value}%`;
        }

        const faderValueId =
          globals.currentMenuChannel === 0
            ? "masterFaderValue"
            : `faderValue-${globals.currentMenuChannel}`;
        const faderValue = document.getElementById(faderValueId);
        if (faderValue) {
          faderValue.textContent = volumeToDb(volume);
        }
      }
    };

    menuVolumeSlider.addEventListener("input", function (e) {
      const value = e.target.value;
      handleVolumeChange(value);

      if (isDragging) {
        const now = Date.now();
        if (now - lastSendTime > sendInterval) {
          const volume = positionToVolume(parseFloat(value));
          sendVolumeCommand(
            globals.currentMenuChannel === 0
              ? "master"
              : globals.currentMenuChannel,
            volume,
          );
          lastSendTime = now;
        }
      }
    });

    menuVolumeSlider.addEventListener("change", function () {
      const volume = positionToVolume(parseFloat(this.value));
      sendVolumeCommand(
        globals.currentMenuChannel === 0
          ? "master"
          : globals.currentMenuChannel,
        volume,
      );
    });

    document.addEventListener("mouseup", function () {
      if (isDragging) {
        isDragging = false;
        const volume = positionToVolume(parseFloat(menuVolumeSlider.value));
        sendVolumeCommand(
          globals.currentMenuChannel === 0
            ? "master"
            : globals.currentMenuChannel,
          volume,
        );
      }
    });

    document.addEventListener("touchend", function () {
      if (isDragging) {
        isDragging = false;
        const volume = positionToVolume(parseFloat(menuVolumeSlider.value));
        sendVolumeCommand(
          globals.currentMenuChannel === 0
            ? "master"
            : globals.currentMenuChannel,
          volume,
        );
      }
    });
  }

  if (menuPanSlider && menuPanValue) {
    let isDragging = false;
    let lastSendTime = 0;
    const sendInterval = 50;

    menuPanSlider.addEventListener("mousedown", function () {
      isDragging = true;
      lastSendTime = Date.now();
    });

    menuPanSlider.addEventListener("touchstart", function () {
      isDragging = true;
      lastSendTime = Date.now();
    });

    menuPanSlider.addEventListener("input", function (e) {
      const value = e.target.value;
      menuPanValue.textContent = panToPercent(parseFloat(value));

      if (
        globals.currentMenuChannel !== null &&
        globals.currentMenuChannel !== 0
      ) {
        const panSliderId = `panSlider-${globals.currentMenuChannel}`;
        const panSlider = document.getElementById(panSliderId);
        if (panSlider) {
          panSlider.value = value;
        }

        const panValueId = `panValue-${globals.currentMenuChannel}`;
        const panValue = document.getElementById(panValueId);
        if (panValue) {
          panValue.textContent = panToPercent(parseFloat(value));
        }
      }

      if (
        isDragging &&
        globals.currentMenuChannel !== null &&
        globals.currentMenuChannel !== 0
      ) {
        const now = Date.now();
        if (now - lastSendTime > sendInterval) {
          sendPanCommand(globals.currentMenuChannel, parseFloat(value));
          lastSendTime = now;
        }
      }
    });

    menuPanSlider.addEventListener("change", function () {
      if (
        globals.currentMenuChannel !== null &&
        globals.currentMenuChannel !== 0
      ) {
        sendPanCommand(globals.currentMenuChannel, parseFloat(this.value));
      }
    });

    document.addEventListener("mouseup", function () {
      if (isDragging) {
        isDragging = false;
        if (
          globals.currentMenuChannel !== null &&
          globals.currentMenuChannel !== 0
        ) {
          sendPanCommand(
            globals.currentMenuChannel,
            parseFloat(menuPanSlider.value),
          );
        }
      }
    });

    document.addEventListener("touchend", function () {
      if (isDragging) {
        isDragging = false;
        if (
          globals.currentMenuChannel !== null &&
          globals.currentMenuChannel !== 0
        ) {
          sendPanCommand(
            globals.currentMenuChannel,
            parseFloat(menuPanSlider.value),
          );
        }
      }
    });
  }
}

// === УПРАВЛЕНИЕ ТРЕКАМИ ===
function openTrackManager() {
  const trackList = document.getElementById("trackList");
  trackList.innerHTML = "";

  const trackIndices = Object.keys(globals.channels)
    .map((key) => parseInt(key))
    .filter((index) => index > 0)
    .sort((a, b) => a - b);

  if (trackIndices.length === 0) {
    trackList.innerHTML =
      '<div style="text-align: center; color: #aaa; padding: 20px;">Треки еще не загружены</div>';
  } else {
    trackIndices.forEach((trackIndex) => {
      const channelDiv = globals.channels[trackIndex];
      if (!channelDiv) return;

      const trackName = channelDiv.querySelector(".channel-name").textContent;
      const isVisible = !globals.hiddenTracks[trackIndex];

      const trackItem = document.createElement("div");
      trackItem.className = "track-item";
      trackItem.innerHTML = `
                <input type="checkbox" class="track-checkbox" ${isVisible ? "checked" : ""} 
                       data-track-index="${trackIndex}" onchange="toggleTrackVisibility(${trackIndex}, this.checked)">
                <div class="track-number">${trackIndex}</div>
                <input type="text" class="track-name-input" value="${trackName}" 
                       data-track-index="${trackIndex}" onchange="updateTrackName(${trackIndex}, this.value)">
                <div class="track-buttons">
                    <button class="track-btn-small" onclick="soloTrack(${trackIndex})" title="Solo">S</button>
                    <button class="track-btn-small" onclick="muteTrack(${trackIndex})" title="Mute">M</button>
                    <button class="track-btn-small" onclick="recordTrack(${trackIndex})" title="Record">R</button>
                </div>
            `;

      trackList.appendChild(trackItem);
    });
  }

  document.getElementById("trackManagerOverlay").style.display = "flex";
}

function closeTrackManager() {
  document.getElementById("trackManagerOverlay").style.display = "none";
}

function toggleTrackVisibility(trackIndex, isVisible) {
  globals.hiddenTracks[trackIndex] = !isVisible;

  const channelDiv = globals.channels[trackIndex];
  if (channelDiv) {
    channelDiv.style.display = isVisible ? "flex" : "none";
  }
}

function updateTrackName(trackIndex, newName) {
  sendCommand(`SET/TRACK/${trackIndex}/NAME/${encodeURIComponent(newName)}`);
}

function selectAllTracks() {
  /** @type {NodeListOf<HTMLInputElement>} */
  const checkboxes = document.querySelectorAll(".track-checkbox");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = true;
    const trackIndex = parseInt(checkbox.dataset.trackIndex);
    globals.hiddenTracks[trackIndex] = false;

    const channelDiv = globals.channels[trackIndex];
    if (channelDiv) {
      channelDiv.style.display = "flex";
    }
  });
}

function deselectAllTracks() {
  /** @type {NodeListOf<HTMLInputElement>} */
  const checkboxes = document.querySelectorAll(".track-checkbox");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = false;
    const trackIndex = parseInt(checkbox.dataset.trackIndex);
    globals.hiddenTracks[trackIndex] = true;

    const channelDiv = globals.channels[trackIndex];
    if (channelDiv) {
      channelDiv.style.display = "none";
    }
  });
}

function applyTrackVisibility() {
  saveSettings();
  showMessage("Настройки треков сохранены", "info");
  closeTrackManager();
}

function soloTrack(trackIndex) {
  toggleSolo(trackIndex);
}

function muteTrack(trackIndex) {
  toggleMute(trackIndex);
}

function recordTrack(trackIndex) {
  toggleRecord(trackIndex);
}

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener("DOMContentLoaded", function () {
  console.log("ReaperVV загружен");

  createMasterChannel();

  setTimeout(() => {
    startSystem();
  }, 300);

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  document.addEventListener("mozfullscreenchange", handleFullscreenChange);
  document.addEventListener("MSFullscreenChange", handleFullscreenChange);

  setupSwipeToClose();
});
// === СИСТЕМА СЕПАРАТОРОВ - ИСПРАВЛЕННЫЙ КОД ===
/**
 *
 * @param {DragEvent} e
 * @param {string} separatorId
 * @returns
 */
function handleSeparatorDrop(e, separatorId) {
  e.preventDefault();
  this.classList.remove("drag-over");

  try {
    const dataText = e.dataTransfer.getData("text/plain");
    if (!dataText) return;

    const data = JSON.parse(dataText);
    if (!data) return;

    if (data.type === "track" && data.trackId) {
      addTrackToSeparator(data.trackId, separatorId);
    } else if (
      data.type === "separator" &&
      data.separatorId &&
      data.separatorId !== separatorId
    ) {
      moveSeparator(data.separatorId, separatorId);
    }
  } catch (error) {
    console.error("Ошибка при drop:", error);
  }
}

function moveSeparator(sourceId, targetId) {
  const sourceEl = document.querySelector(`[data-separator-id="${sourceId}"]`);
  const targetEl = document.querySelector(`[data-separator-id="${targetId}"]`);

  if (!sourceEl || !targetEl || sourceEl === targetEl) {
    console.warn("Не удалось найти сепараторы для перемещения");
    return;
  }

  const mixerSection = document.getElementById("mixerSection");
  if (!mixerSection) {
    console.error("Секция микшера не найдена");
    return;
  }

  // Вставляем sourceEl после targetEl
  if (targetEl.nextSibling) {
    mixerSection.insertBefore(sourceEl, targetEl.nextSibling);
  } else {
    mixerSection.appendChild(sourceEl);
  }

  console.log(`✅ Сепаратор ${sourceId} перемещен после ${targetId}`);
}

/**
 *
 * @param {string} separatorId
 * @returns {HTMLDivElement}
 */
function createSeparatorElement(separatorId) {
  const separator = separatorSystem.separators[separatorId];
  if (!separator) {
    console.warn(`Сепаратор ${separatorId} не найден в системе`);
    return null;
  }

  // Проверяем, не существует ли уже
  if (document.querySelector(`[data-separator-id="${separatorId}"]`)) {
    console.warn(`Сепаратор ${separatorId} уже существует в DOM`);
    return null;
  }

  const separatorEl = document.createElement("div");
  separatorEl.className = "simple-separator";
  separatorEl.dataset.separatorId = separatorId;
  separatorEl.draggable = true;

  const tracksCount = separator.tracks.length;

  separatorEl.innerHTML = `
        <div class="separator-header">
            <div class="separator-title" onclick="toggleSeparatorCollapse('${separatorId}')">
                ${separator.name}
            </div>
            <button class="separator-edit-btn" onclick="editSeparator('${separatorId}'); event.stopPropagation();">✎</button>
        </div>
        <div class="separator-content" style="${separator.collapsed ? "display: none;" : ""}">
            <div class="separator-empty" ${tracksCount > 0 ? 'style="display: none;"' : ""}>
                <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📁</div>
                <div>Перетащите треки сюда</div>
            </div>
        </div>
        <div class="separator-controls" ${tracksCount === 0 ? 'style="display: none;"' : ""}>
            <button class="separator-control-btn" onclick="expandAllInSeparator('${separatorId}'); event.stopPropagation();">Показать</button>
            <button class="separator-control-btn" onclick="collapseAllInSeparator('${separatorId}'); event.stopPropagation();">Скрыть</button>
        </div>
    `;

  // Drag & drop события
  separatorEl.addEventListener("dragover", function (e) {
    e.preventDefault();
    this.classList.add("drag-over");
  });

  separatorEl.addEventListener("dragleave", function () {
    this.classList.remove("drag-over");
  });

  separatorEl.addEventListener("drop", function (e) {
    e.preventDefault();
    this.classList.remove("drag-over");
    handleSeparatorDrop(e, separatorId);
  });

  // Drag для перемещения сепаратора
  separatorEl.addEventListener("dragstart", function (e) {
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({
        type: "separator",
        separatorId: separatorId,
      }),
    );
    this.classList.add("dragging");
  });

  separatorEl.addEventListener("dragend", function () {
    this.classList.remove("dragging");
  });

  // Добавляем в микшер
  const mixerSection = document.getElementById("mixerSection");
  if (mixerSection) {
    if (globals.masterOnLeft && globals.masterChannel) {
      mixerSection.insertBefore(separatorEl, globals.masterChannel.nextSibling);
    } else {
      mixerSection.appendChild(separatorEl);
    }
  }

  // Обновляем отображение треков
  updateSeparatorContent(separatorId);

  return separatorEl;
}

function updateSeparatorContent(separatorId) {
  const separator = separatorSystem.separators[separatorId];
  if (!separator) return;

  const separatorEl = document.querySelector(
    `[data-separator-id="${separatorId}"]`,
  );
  if (!separatorEl) return;

  const contentEl = separatorEl.querySelector(".separator-content");
  const emptyEl = separatorEl.querySelector(".separator-empty");
  const controlsEl = separatorEl.querySelector(".separator-controls");

  if (!contentEl || !emptyEl || !controlsEl) return;

  // Обновляем видимость элементов
  const hasTracks = separator.tracks.length > 0;
  controlsEl.style.display = hasTracks ? "flex" : "none";
  emptyEl.style.display = hasTracks ? "none" : "flex";

  // Удаляем старые треки (кроме empty элемента)
  const existingTracks = contentEl.querySelectorAll(".separator-track");
  existingTracks.forEach((track) => {
    if (!track.classList.contains("separator-empty")) {
      track.remove();
    }
  });

  // Добавляем треки
  separator.tracks.forEach((trackId) => {
    const trackDiv = document.createElement("div");
    trackDiv.className = "separator-track";
    trackDiv.draggable = true;

    const trackData = getTrackInfo(trackId);

    trackDiv.innerHTML = `
            <div class="track-number">${trackId}</div>
            <div class="track-name">${trackData.name || `Трек ${trackId}`}</div>
            <div class="track-remove" onclick="event.stopPropagation(); removeTrackFromSeparator(${trackId}, '${separatorId}');">×</div>
        `;

    // Drag для трека внутри сепаратора
    trackDiv.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          type: "track",
          trackId: trackId,
        }),
      );
      this.classList.add("dragging");
    });

    trackDiv.addEventListener("dragend", function () {
      this.classList.remove("dragging");
    });

    // Клик для открытия меню трека
    trackDiv.addEventListener("click", function (e) {
      if (!e.target.classList.contains("track-remove")) {
        openChannelMenu(trackId);
      }
    });

    contentEl.appendChild(trackDiv);
  });
}

// Оптимизированная функция добавления трека в сепаратор
function addTrackToSeparator(trackId, separatorId) {
  const separator = separatorSystem.separators[separatorId];
  if (!separator) {
    console.warn(`Сепаратор ${separatorId} не найден`);
    return false;
  }

  // Проверяем, нет ли уже этого трека в сепараторе
  if (separator.tracks.includes(trackId)) {
    console.log(`Трек ${trackId} уже в сепараторе ${separatorId}`);
    return true;
  }

  // Удаляем трек из других сепараторов
  Object.keys(separatorSystem.separators).forEach((id) => {
    const sep = separatorSystem.separators[id];
    const index = sep.tracks.indexOf(trackId);
    if (index > -1) {
      sep.tracks.splice(index, 1);
      updateSeparatorContent(id);
    }
  });

  // Добавляем в новый сепаратор
  separator.tracks.push(trackId);

  // Скрываем трек в микшере
  const channelDiv = globals.channels[trackId];
  if (channelDiv) {
    channelDiv.style.display = "none";
  }

  // Обновляем отображение
  updateSeparatorContent(separatorId);
  updateSeparatorUI();

  // Сохраняем
  saveSeparators();

  console.log(`✅ Трек ${trackId} добавлен в сепаратор "${separator.name}"`);
  return true;
}

// Оптимизированная функция удаления трека из сепаратора
function removeTrackFromSeparator(trackId, separatorId) {
  const separator = separatorSystem.separators[separatorId];
  if (!separator) {
    console.warn(`Сепаратор ${separatorId} не найден`);
    return false;
  }

  const index = separator.tracks.indexOf(trackId);
  if (index === -1) {
    console.warn(`Трек ${trackId} не найден в сепараторе ${separatorId}`);
    return false;
  }

  separator.tracks.splice(index, 1);

  // Показываем трек в микшере
  const channelDiv = globals.channels[trackId];
  if (channelDiv) {
    channelDiv.style.display = "flex";
  }

  // Обновляем отображение
  updateSeparatorContent(separatorId);
  updateSeparatorUI();

  // Сохраняем
  saveSeparators();

  console.log(`✅ Трек ${trackId} удален из сепаратора "${separator.name}"`);
  return true;
}

// Функция для получения информации о треке с кэшированием
const trackInfoCache = {};
function getTrackInfo(trackId) {
  if (trackInfoCache[trackId]) {
    return trackInfoCache[trackId];
  }

  const channelDiv = globals.channels[trackId];
  const info = {
    name: channelDiv
      ? channelDiv.querySelector(".channel-name")?.textContent ||
        `Трек ${trackId}`
      : `Трек ${trackId}`,
  };

  trackInfoCache[trackId] = info;
  return info;
}

// Обновляем инициализацию сепараторов
function initSeparatorSystem() {
  console.log("🔄 Инициализация системы сепараторов...");

  // Загружаем настройки
  const savedSettings = localStorage.getItem("vv1_separator_system");
  if (savedSettings) {
    try {
      Object.assign(separatorSystem, JSON.parse(savedSettings));
    } catch (e) {
      console.warn("Ошибка загрузки настроек сепараторов:", e);
      separatorSystem.enabled = true;
      separatorSystem.syncWithReaper = true;
    }
  }

  // Загружаем сепараторы
  const savedSeparators = localStorage.getItem("vv1_separators");
  if (savedSeparators) {
    try {
      const data = JSON.parse(savedSeparators);
      separatorSystem.separators = data.separators || {};
      separatorSystem.nextId = data.nextId || 1;
    } catch (e) {
      console.warn("Ошибка загрузки сепараторов:", e);
      separatorSystem.separators = {};
      separatorSystem.nextId = 1;
    }
  }

  // Обновляем интерфейс
  updateSeparatorUI();

  // Восстанавливаем сепараторы с задержкой
  setTimeout(() => {
    Object.keys(separatorSystem.separators).forEach((id) => {
      createSeparatorElement(id);
    });
    console.log(
      `✅ Загружено ${
        Object.keys(separatorSystem.separators).length
      } сепараторов`,
    );
  }, 300);

  console.log("✅ Система сепараторов инициализирована");
}

// Добавляем обработку drag & drop для микшерной секции
function setupMixerSectionDrop() {
  const mixerSection = document.getElementById("mixerSection");
  if (!mixerSection) return;

  mixerSection.addEventListener("dragover", function (e) {
    e.preventDefault();
    this.classList.add("drop-zone");
  });

  mixerSection.addEventListener("dragleave", function () {
    this.classList.remove("drop-zone");
  });

  mixerSection.addEventListener("drop", function (e) {
    e.preventDefault();
    this.classList.remove("drop-zone");

    try {
      const dataText = e.dataTransfer.getData("text/plain");
      if (!dataText) return;

      const data = JSON.parse(dataText);
      if (data.type === "track" && data.trackId) {
        // Удаляем трек из всех сепараторов
        Object.keys(separatorSystem.separators).forEach((separatorId) => {
          removeTrackFromSeparator(data.trackId, separatorId);
        });
      }
    } catch (error) {
      console.error("Ошибка при drop в микшер:", error);
    }
  });
}

// Обновляем инициализацию системы
document.addEventListener("DOMContentLoaded", function () {
  console.log("ReaperVV загружен");

  createMasterChannel();

  setTimeout(() => {
    startSystem();
    setupMixerSectionDrop(); // Добавляем обработку drop для микшерной секции
  }, 300);

  // Остальные обработчики событий...
});

// Экспортируем исправленные функции
window.handleSeparatorDrop = handleSeparatorDrop;
window.moveSeparator = moveSeparator;
window.getTrackInfo = getTrackInfo;
// === ЭКСПОРТ ФУНКЦИЙ ===
window.toggleControlPanel = toggleControlPanel;
window.toggleMute = toggleMute;
window.toggleSolo = toggleSolo;
window.toggleRecord = toggleRecord;
window.toggleMasterMute = toggleMasterMute;
window.setPan = setPan;
window.resetPan = resetPan;
window.transportPlay = transportPlay;
window.transportStop = transportStop;
window.transportRecord = transportRecord;
window.transportPause = transportPause;
window.transportRewind = transportRewind;
window.transportFastForward = transportFastForward;
window.saveProject = saveProject;
window.undoAction = undoAction;
window.toggleMetronome = toggleMetronome;
window.toggleRepeat = toggleRepeat;
window.refreshAll = refreshAll;
window.toggleAutoUpdate = toggleAutoUpdate;
window.showHelp = showHelp;
window.resetConnection = resetConnection;
window.toggleFullscreen = toggleFullscreen;
window.toggleMasterPosition = toggleMasterPosition;
window.toggleMasterChannel = toggleMasterChannel;
window.openChannelMenu = openChannelMenu;
window.closeChannelMenu = closeChannelMenu;
window.openTrackManager = openTrackManager;
window.closeTrackManager = closeTrackManager;
window.toggleTrackVisibility = toggleTrackVisibility;
window.updateTrackName = updateTrackName;
window.selectAllTracks = selectAllTracks;
window.deselectAllTracks = deselectAllTracks;
window.applyTrackVisibility = applyTrackVisibility;
window.soloTrack = soloTrack;
window.muteTrack = muteTrack;
window.recordTrack = recordTrack;
window.createNewSeparator = createNewSeparator;
window.clearAllSeparators = clearAllSeparators;
window.toggleSeparatorCollapse = toggleSeparatorCollapse;
window.editSeparator = editSeparator;
window.expandAllInSeparator = expandAllInSeparator;
window.collapseAllInSeparator = collapseAllInSeparator;
window.removeTrackFromSeparator = removeTrackFromSeparator;
window.toggleSeparatorSync = toggleSeparatorSync;
