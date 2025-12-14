import { sendCommand } from "./client.js";
import { globals } from "./globals.js";

/**
 *
 * @param {number} trackIndex
 * @param {number} value
 */
export function updatePanDisplay(trackIndex, value) {
  /** @type {HTMLInputElement} */
  const panValue = document.getElementById(`panValue-${trackIndex}`);
  if (panValue) {
    panValue.textContent = panToPercent(parseFloat(value));
  }
}

export function sendVolumeCommand(trackId, volume) {
  const command =
    trackId === "master"
      ? `SET/TRACK/0/VOL/${volume.toFixed(6)}`
      : `SET/TRACK/${trackId}/VOL/${volume.toFixed(6)}`;
  sendCommand(command);
}

/**
 *
 * @param {number} position
 * @returns {number}
 */
export function positionToVolume(position) {
  if (position <= 0) return 0;
  const dB = position * (60 / 75) - 60;
  if (dB <= -55) return 0;
  return Math.exp(dB / 8.68588963806);
}

/**
 *
 * @param {number} volume
 * @returns {string}
 */

export function volumeToDb(volume) {
  if (volume <= 0.00000001) return "-∞ dB";
  const dB = Math.log(volume) * 8.68588963806;
  return dB.toFixed(1) + " dB";
}

/**
 *
 * @param {number} pan
 * @returns {string}
 */
export function panToPercent(pan) {
  if (Math.abs(pan) < 0.01) return "Center";
  if (pan > 0) return "R" + (pan * 100).toFixed(0) + "%";
  return "L" + (pan * -100).toFixed(0) + "%";
}

/**
 *
 * @param {number} trackIndex
 * @param {number} value
 */
export function sendPanCommand(trackIndex, value) {
  sendCommand(`SET/TRACK/${trackIndex}/PAN/${value}`);
}

export function checkConnection() {
  sendCommand("PING");
}

/**
 *
 * @param {number} trackIndex
 */
export function updateChannelMenuButtons(trackIndex) {
  if (globals.currentMenuChannel !== trackIndex) return;

  const channelDiv =
    globals.channels[trackIndex] ||
    (trackIndex === 0 ? globals.masterChannel : null);
  if (!channelDiv) return;

  const menuControls = document.getElementById("channelMenuControls");
  if (!menuControls) return;

  const buttons = menuControls.querySelectorAll(".channel-btn");
  buttons.forEach((button) => {
    const btnType = button.classList.contains("mute")
      ? "mute"
      : button.classList.contains("solo")
        ? "solo"
        : button.classList.contains("rec")
          ? "rec"
          : null;

    if (btnType && btnType !== "close") {
      const isActive = channelDiv
        .querySelector(`.channel-btn.${btnType}`)
        ?.classList.contains("active");
      button.classList.toggle("active", isActive);
    }
  });

  const menuVolumeSlider = document.getElementById("channelMenuVolumeSlider");
  const menuVolumeValue = document.getElementById("channelMenuVolumeValue");
  if (menuVolumeSlider && menuVolumeValue) {
    const faderKnob = document.getElementById(
      trackIndex === 0 ? "masterFader" : `fader-${trackIndex}`,
    );
    if (faderKnob) {
      const currentPos = parseFloat(faderKnob.style.bottom) || 75;
      menuVolumeSlider.value = currentPos;
      const volume = positionToVolume(currentPos);
      menuVolumeValue.textContent = volumeToDb(volume);
    }
  }

  const menuPanSlider = document.getElementById("channelMenuPanSlider");
  const menuPanValue = document.getElementById("channelMenuPanValue");
  if (trackIndex !== 0 && menuPanSlider && menuPanValue) {
    const panSlider = channelDiv.querySelector(".pan-slider");
    if (panSlider) {
      menuPanSlider.value = panSlider.value;
      menuPanValue.textContent = panToPercent(parseFloat(panSlider.value));
    }
  }
}
