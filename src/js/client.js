import { globals } from "./globals.js";
import { createChannel, updateChannel, updateMasterChannel } from "./mixing.js";
import { checkConnection } from "./utils.js";

// Конфигурация подключения
const REAPER_HOST = window.location.hostname || "localhost";
const REAPER_PORT = window.location.port || "8080";
const REAPER_API_BASE = `http://${REAPER_HOST}:${REAPER_PORT}/_`;
let projectBPM = 120.0;

/**
 *
 * @param {Response} response
 * @returns {boolean}
 */
const isJSONErrorResponse = (response) => {
  return (
    response.body &&
    !response.ok &&
    response.headers.get("content-type")?.includes("json")
  );
};

/**
 *
 * @param {string} command
 */
export async function sendCommand(command) {
  const url = `${REAPER_API_BASE}/${command}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/plain",
        "Cache-Control": "no-cache",
      },
      mode: "cors",
    });
    if (isJSONErrorResponse(response)) {
      const errorBody = await response.json();
      // зависит от того, что в ответе от сервера
      console.error(errorBody.message);
    }
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = await response.text();
    globals.isConnected = true;
    updateConnectionStatus(true);
    processResponse(data);
  } catch (err) {
    console.error("Ошибка запроса:", err);
    globals.isConnected = false;
    updateConnectionStatus(false);

    if (command === "PING") {
      setTimeout(checkConnection, 1000);
    }
  }
}

/**
 *
 * @param {string} responseText
 */
export function processResponse(responseText) {
  if (!responseText) return;

  const lines = responseText.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split("\t");
    const command = parts[0];

    switch (command) {
      case "PING":
        globals.isConnected = true;
        updateConnectionStatus(true);
        break;

      case "TRANSPORT":
        if (parts.length > 1) {
          const state = parseInt(parts[1]);
          const time = parts[4] || "00:00.000";
          const beats = parts[5] || "1.1.00";
          const bpm = parts[6] || "120.00";
          const region = parts[8] || "--";

          updateTransportDisplay(state, time, beats, bpm, region);
        }
        break;

      case "TRACK":
        if (parts.length >= 14) {
          const trackIndex = parseInt(parts[1]);
          const trackData = parseTrackData(parts);

          if (trackIndex === 0) {
            updateMasterChannel(trackData);
          } else if (trackIndex > 0) {
            if (!globals.channels[trackIndex]) {
              createChannel(trackIndex, trackData);
            } else {
              updateChannel(trackIndex, trackData);
            }
          }
        }
        break;
    }
  }
}

/**
 *
 * @param {number} state
 * @param {string} time
 * @param {string} beats
 * @param {string} bpm
 * @param {string} region
 */
function updateTransportDisplay(state, time, beats, bpm, region) {
  const display = document.getElementById("transportDisplay");
  if (display) {
    display.textContent = `${time} | ${beats}`;

    switch (state) {
      case 1:
        display.style.color = "#4CAF50";
        break;
      case 5:
        display.style.color = "#F44336";
        break;
      case 2:
        display.style.color = "#FF9800";
        break;
      default:
        display.style.color = "#aaa";
    }
  }

  const bpmDisplay = document.getElementById("bpmDisplay");
  if (bpmDisplay && bpm) {
    projectBPM = parseFloat(bpm).toFixed(2);
    bpmDisplay.textContent = `BPM: ${projectBPM}`;
  }

  const regionDisplay = document.getElementById("regionDisplay");
  if (regionDisplay && region) {
    regionDisplay.textContent = region;
  }
}

/**
 *
 * @param {string[]} parts
 */
function parseTrackData(parts) {
  const trackIndex = parseInt(parts[1]);
  const flags = parseInt(parts[3]) || 0;
  const peak = parseInt(parts[6]) || 0;

  return {
    name: parts[2] || `Track ${trackIndex}`,
    flags: flags,
    volume: parseFloat(parts[4]) || 1.0,
    pan: parseFloat(parts[5]) || 0,
    peak: peak,
    color: parts[13] || "0",
    isMuted: (flags & 8) !== 0,
    isSoloed: (flags & 16) !== 0,
    isRecordArmed: (flags & 64) !== 0,
  };
}

function updateConnectionStatus(connected) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");

  globals.isConnected = connected;

  if (connected) {
    dot.className = "status-dot connected";
    text.textContent = "Подключено";
    text.style.color = "#4CAF50";
  } else {
    dot.className = "status-dot";
    text.textContent = "Отключено";
    text.style.color = "#F44336";
  }
}
