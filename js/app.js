// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let channels = {};
let masterChannel = null;
let isConnected = false;
let autoUpdateEnabled = true;
let transportState = 0;
let isFullscreen = false;
let masterOnLeft = true;
let masterChannelVisible = true;
let currentMenuChannel = null;
let vuSmoothing = {};
let projectBPM = 120.00;
let currentRegion = '--';
let hiddenTracks = {};

// Система сепараторов
let separatorSystem = {
    enabled: true,
    syncWithReaper: true,
    separators: {},
    nextId: 1
};

// Конфигурация подключения
const REAPER_HOST = window.location.hostname || 'localhost';
const REAPER_PORT = window.location.port || '8080';
const REAPER_API_BASE = `http://${REAPER_HOST}:${REAPER_PORT}/_`;

// Таймеры
let panSliders = {};
let menuVolumeTimer = null;
let menuPanTimer = null;
let menuVolumeDragging = false;
let menuPanDragging = false;

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function volumeToPosition(volume) {
    if (volume <= 0.00000001) return 0;
    const dB = Math.log(volume) * 8.68588963806;
    return Math.max(0, Math.min(100, (dB + 60) * (75 / 60)));
}

function positionToVolume(position) {
    if (position <= 0) return 0;
    const dB = (position * (60 / 75)) - 60;
    if (dB <= -55) return 0;
    return Math.exp(dB / 8.68588963806);
}

function volumeToDb(volume) {
    if (volume <= 0.00000001) return "-∞ dB";
    const dB = Math.log(volume) * 8.68588963806;
    return dB.toFixed(1) + " dB";
}

function panToPercent(pan) {
    if (Math.abs(pan) < 0.01) return "Center";
    if (pan > 0) return "R" + (pan * 100).toFixed(0) + "%";
    return "L" + (pan * -100).toFixed(0) + "%";
}

function applyTrackColor(channelDiv, colorValue) {
    if (!colorValue || colorValue === "0" || colorValue === "0x0") {
        channelDiv.style.borderColor = "";
        channelDiv.classList.remove('color-track');
        return;
    }
    
    try {
        let colorStr = colorValue.toString().toLowerCase().replace('0x', '');
        if (!/^[0-9a-f]{6,8}$/i.test(colorStr)) return;
        
        const colorInt = parseInt(colorStr, 16);
        if (isNaN(colorInt)) return;
        
        let r, g, b, a = 1;
        
        if (colorStr.length === 8) {
            a = ((colorInt >> 24) & 0xFF) / 255;
            r = (colorInt >> 16) & 0xFF;
            g = (colorInt >> 8) & 0xFF;
            b = colorInt & 0xFF;
        } else {
            r = (colorInt >> 16) & 0xFF;
            g = (colorInt >> 8) & 0xFF;
            b = colorInt & 0xFF;
        }
        
        const color = a < 0.1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
        
        channelDiv.style.borderColor = color;
        channelDiv.classList.add('color-track');
        
        const header = channelDiv.querySelector('.channel-header');
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
    const faderTrack = channelDiv.querySelector('.fader-track');
    if (!faderTrack || faderTrack.querySelector('.fader-marker')) return;
    
    const markers = [
        {pos: 0, label: '-∞', thick: false},
        {pos: 30, label: '-30', thick: false},
        {pos: 50, label: '-10', thick: false},
        {pos: 75, label: '0', thick: true},
        {pos: 90, label: '+10', thick: false},
        {pos: 100, label: '+20', thick: false}
    ];
    
    markers.forEach(marker => {
        const markerEl = document.createElement('div');
        markerEl.className = `fader-marker ${marker.thick ? 'thick' : ''}`;
        markerEl.style.top = `${100 - marker.pos}%`;
        
        if (marker.thick) {
            const label = document.createElement('div');
            label.className = 'fader-label';
            label.textContent = marker.label;
            markerEl.appendChild(label);
        }
        
        faderTrack.appendChild(markerEl);
    });
}

// === СИСТЕМА СЕПАРАТОРОВ ===
function initSeparatorSystem() {
    console.log('🔄 Инициализация системы сепараторов...');
    
    // Загружаем настройки
    const savedSettings = localStorage.getItem('vv1_separator_system');
    if (savedSettings) {
        try {
            Object.assign(separatorSystem, JSON.parse(savedSettings));
        } catch (e) {
            console.warn('Ошибка загрузки настроек сепараторов:', e);
        }
    }
    
    // Загружаем сепараторы
    const savedSeparators = localStorage.getItem('vv1_separators');
    if (savedSeparators) {
        try {
            const data = JSON.parse(savedSeparators);
            separatorSystem.separators = data.separators || {};
            separatorSystem.nextId = data.nextId || 1;
        } catch (e) {
            console.warn('Ошибка загрузки сепараторов:', e);
        }
    }
    
    // Обновляем интерфейс
    updateSeparatorUI();
    
    // Восстанавливаем сепараторы
    setTimeout(() => {
        Object.keys(separatorSystem.separators).forEach(id => {
            createSeparatorElement(id);
        });
    }, 100);
    
    console.log('✅ Система сепараторов инициализирована');
}

function updateSeparatorUI() {
    const countElement = document.getElementById('separatorCount');
    if (countElement) {
        countElement.textContent = Object.keys(separatorSystem.separators).length;
    }
    
    const syncText = document.getElementById('separatorSyncText');
    if (syncText) {
        syncText.textContent = separatorSystem.syncWithReaper ? 'ВКЛ' : 'ВЫКЛ';
    }
}

function createNewSeparator(name = 'Группа') {
    const id = `sep_${separatorSystem.nextId++}`;
    
    separatorSystem.separators[id] = {
        id: id,
        name: name,
        tracks: [],
        createdAt: Date.now(),
        collapsed: false
    };
    
    saveSeparators();
    createSeparatorElement(id);
    updateSeparatorUI();
    
    console.log(`✅ Создан сепаратор: ${name} (${id})`);
    return id;
}

function createSeparatorElement(separatorId) {
    const separator = separatorSystem.separators[separatorId];
    if (!separator || document.querySelector(`[data-separator-id="${separatorId}"]`)) return;
    
    const separatorEl = document.createElement('div');
    separatorEl.className = 'simple-separator';
    separatorEl.dataset.separatorId = separatorId;
    separatorEl.draggable = true;
    
    const tracksCount = separator.tracks.length;
    const tracksText = tracksCount === 0 ? 'Пусто' : `${tracksCount} трек${tracksCount === 1 ? '' : 'а'}`;
    
    separatorEl.innerHTML = `
        <div class="separator-header">
            <div class="separator-title" onclick="toggleSeparatorCollapse('${separatorId}')">
                ${separator.name}
            </div>
            <button class="separator-edit-btn" onclick="editSeparator('${separatorId}')">✎</button>
        </div>
        <div class="separator-content" style="${separator.collapsed ? 'display: none;' : ''}">
            <div class="separator-empty" ${tracksCount > 0 ? 'style="display: none;"' : ''}>
                <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📁</div>
                <div>Перетащите треки сюда</div>
            </div>
        </div>
        <div class="separator-controls" ${tracksCount === 0 ? 'style="display: none;"' : ''}>
            <button class="separator-control-btn" onclick="expandAllInSeparator('${separatorId}')">Показать</button>
            <button class="separator-control-btn" onclick="collapseAllInSeparator('${separatorId}')">Скрыть</button>
        </div>
    `;
    
    // Drag & drop события
    separatorEl.addEventListener('dragover', handleSeparatorDragOver);
    separatorEl.addEventListener('dragleave', handleSeparatorDragLeave);
    separatorEl.addEventListener('drop', (e) => handleSeparatorDrop(e, separatorId));
    
    // Drag для перемещения сепаратора
    separatorEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
            type: 'separator',
            separatorId: separatorId
        }));
        separatorEl.classList.add('dragging');
    });
    
    separatorEl.addEventListener('dragend', () => {
        separatorEl.classList.remove('dragging');
    });
    
    // Добавляем в микшер
    const mixerSection = document.getElementById('mixerSection');
    if (mixerSection) {
        if (masterOnLeft && masterChannel) {
            mixerSection.insertBefore(separatorEl, masterChannel.nextSibling);
        } else {
            mixerSection.appendChild(separatorEl);
        }
    }
    
    // Обновляем отображение треков
    updateSeparatorContent(separatorId);
    
    return separatorEl;
}

function handleSeparatorDragOver(e) {
    e.preventDefault();
    this.classList.add('drag-over');
}

function handleSeparatorDragLeave() {
    this.classList.remove('drag-over');
}

function handleSeparatorDrop(e, separatorId) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (!data) return;
        
        if (data.type === 'track' && data.trackId) {
            addTrackToSeparator(data.trackId, separatorId);
        } else if (data.type === 'separator' && data.separatorId !== separatorId) {
            moveSeparator(data.separatorId, separatorId);
        }
    } catch (error) {
        console.error('Ошибка при drop:', error);
    }
}

function addTrackToSeparator(trackId, separatorId) {
    const separator = separatorSystem.separators[separatorId];
    if (!separator || separator.tracks.includes(trackId)) return false;
    
    // Удаляем из других сепараторов
    Object.keys(separatorSystem.separators).forEach(id => {
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
    const channelDiv = channels[trackId];
    if (channelDiv) {
        channelDiv.style.display = 'none';
    }
    
    // Обновляем отображение
    updateSeparatorContent(separatorId);
    updateSeparatorUI();
    
    // Сохраняем
    saveSeparators();
    
    return true;
}

function removeTrackFromSeparator(trackId, separatorId) {
    const separator = separatorSystem.separators[separatorId];
    if (!separator) return false;
    
    const index = separator.tracks.indexOf(trackId);
    if (index === -1) return false;
    
    separator.tracks.splice(index, 1);
    
    // Показываем трек в микшере
    const channelDiv = channels[trackId];
    if (channelDiv) {
        channelDiv.style.display = 'flex';
    }
    
    // Обновляем отображение
    updateSeparatorContent(separatorId);
    updateSeparatorUI();
    
    // Сохраняем
    saveSeparators();
    
    return true;
}

function updateSeparatorContent(separatorId) {
    const separator = separatorSystem.separators[separatorId];
    if (!separator) return;
    
    const separatorEl = document.querySelector(`[data-separator-id="${separatorId}"]`);
    if (!separatorEl) return;
    
    const contentEl = separatorEl.querySelector('.separator-content');
    const emptyEl = separatorEl.querySelector('.separator-empty');
    const controlsEl = separatorEl.querySelector('.separator-controls');
    
    if (!contentEl || !emptyEl || !controlsEl) return;
    
    // Обновляем видимость элементов
    controlsEl.style.display = separator.tracks.length > 0 ? 'flex' : 'none';
    emptyEl.style.display = separator.tracks.length > 0 ? 'none' : 'flex';
    
    // Очищаем содержимое (кроме empty элемента)
    const existingTracks = contentEl.querySelectorAll('.separator-track');
    existingTracks.forEach(track => {
        if (!track.classList.contains('separator-empty')) track.remove();
    });
    
    // Добавляем треки
    separator.tracks.forEach(trackId => {
        const trackDiv = document.createElement('div');
        trackDiv.className = 'separator-track';
        trackDiv.draggable = true;
        
        const trackData = getTrackInfo(trackId);
        
        trackDiv.innerHTML = `
            <div class="track-number">${trackId}</div>
            <div class="track-name">${trackData.name || `Трек ${trackId}`}</div>
            <div class="track-remove" onclick="removeTrackFromSeparator(${trackId}, '${separatorId}'); event.stopPropagation();">×</div>
        `;
        
        // Drag для трека внутри сепаратора
        trackDiv.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'track',
                trackId: trackId
            }));
            trackDiv.classList.add('dragging');
        });
        
        trackDiv.addEventListener('dragend', () => {
            trackDiv.classList.remove('dragging');
        });
        
        // Клик для открытия меню трека
        trackDiv.addEventListener('click', () => {
            openChannelMenu(trackId);
        });
        
        contentEl.appendChild(trackDiv);
    });
}

function getTrackInfo(trackId) {
    const channelDiv = channels[trackId];
    if (!channelDiv) return { name: `Трек ${trackId}` };
    
    const nameElement = channelDiv.querySelector('.channel-name');
    return {
        name: nameElement ? nameElement.textContent : `Трек ${trackId}`
    };
}

function editSeparator(separatorId) {
    const separator = separatorSystem.separators[separatorId];
    if (!separator) return;
    
    const newName = prompt('Название сепаратора:', separator.name);
    if (newName !== null && newName.trim() !== '') {
        separator.name = newName.trim();
        
        const separatorEl = document.querySelector(`[data-separator-id="${separatorId}"]`);
        if (separatorEl) {
            const titleEl = separatorEl.querySelector('.separator-title');
            if (titleEl) titleEl.textContent = separator.name;
        }
        
        saveSeparators();
    }
}

function toggleSeparatorCollapse(separatorId) {
    const separator = separatorSystem.separators[separatorId];
    if (!separator) return;
    
    separator.collapsed = !separator.collapsed;
    
    const separatorEl = document.querySelector(`[data-separator-id="${separatorId}"]`);
    if (separatorEl) {
        const contentEl = separatorEl.querySelector('.separator-content');
        if (contentEl) {
            contentEl.style.display = separator.collapsed ? 'none' : 'block';
        }
    }
    
    saveSeparators();
}

function expandAllInSeparator(separatorId) {
    const separator = separatorSystem.separators[separatorId];
    if (!separator) return;
    
    separator.tracks.forEach(trackId => {
        const channelDiv = channels[trackId];
        if (channelDiv) {
            channelDiv.style.display = 'flex';
        }
    });
    
    showMessage(`Треки из "${separator.name}" показаны`, "info");
}

function collapseAllInSeparator(separatorId) {
    const separator = separatorSystem.separators[separatorId];
    if (!separator) return;
    
    separator.tracks.forEach(trackId => {
        const channelDiv = channels[trackId];
        if (channelDiv) {
            channelDiv.style.display = 'none';
        }
    });
    
    showMessage(`Треки из "${separator.name}" скрыты`, "info");
}

function moveSeparator(sourceId, targetId) {
    // Простая перестановка в DOM
    const sourceEl = document.querySelector(`[data-separator-id="${sourceId}"]`);
    const targetEl = document.querySelector(`[data-separator-id="${targetId}"]`);
    
    if (!sourceEl || !targetEl || sourceEl === targetEl) return;
    
    const mixerSection = document.getElementById('mixerSection');
    if (mixerSection) {
        mixerSection.insertBefore(sourceEl, targetEl.nextSibling);
    }
}

function clearAllSeparators() {
    if (!confirm('Удалить все сепараторы и вернуть треки в микшер?')) return;
    
    // Показываем все треки
    Object.values(separatorSystem.separators).forEach(separator => {
        separator.tracks.forEach(trackId => {
            const channelDiv = channels[trackId];
            if (channelDiv) {
                channelDiv.style.display = 'flex';
            }
        });
    });
    
    // Удаляем сепараторы из DOM
    document.querySelectorAll('.simple-separator').forEach(el => el.remove());
    
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
    showMessage(`Синхронизация с REAPER: ${separatorSystem.syncWithReaper ? 'ВКЛ' : 'ВЫКЛ'}`, "info");
}

function saveSeparators() {
    try {
        const data = {
            separators: separatorSystem.separators,
            nextId: separatorSystem.nextId
        };
        localStorage.setItem('vv1_separators', JSON.stringify(data));
        localStorage.setItem('vv1_separator_system', JSON.stringify({
            enabled: separatorSystem.enabled,
            syncWithReaper: separatorSystem.syncWithReaper
        }));
    } catch (e) {
        console.error('Ошибка сохранения сепараторов:', e);
    }
}

function setupTrackDrag() {
    Object.keys(channels).forEach(trackId => {
        const channelDiv = channels[trackId];
        if (channelDiv && parseInt(trackId) > 0) {
            channelDiv.setAttribute('draggable', 'true');
            channelDiv.style.cursor = 'grab';
            
            channelDiv.addEventListener('dragstart', function(e) {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    type: 'track',
                    trackId: trackId
                }));
                this.classList.add('dragging');
            });
            
            channelDiv.addEventListener('dragend', function() {
                this.classList.remove('dragging');
            });
            
            // Drag over для подсветки сепараторов
            channelDiv.addEventListener('dragenter', function(e) {
                e.preventDefault();
            });
            
            channelDiv.addEventListener('dragover', function(e) {
                e.preventDefault();
            });
        }
    });
}

// === МИКШЕРНЫЕ ФУНКЦИИ ===
function createMasterChannel() {
    const mixerSection = document.getElementById('mixerSection');
    if (!mixerSection) return;
    
    const masterDiv = document.createElement('div');
    masterDiv.className = 'channel-strip master';
    masterDiv.id = 'masterChannel';
    masterDiv.dataset.trackIndex = '0';
    
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
    
    if (masterOnLeft) {
        mixerSection.prepend(masterDiv);
    } else {
        mixerSection.appendChild(masterDiv);
    }
    
    masterChannel = masterDiv;
    initFader('masterFader', 1.0, 'master');
}

function createChannel(trackIndex, trackData) {
    const mixerSection = document.getElementById('mixerSection');
    if (!mixerSection) return;
    
    if (channels[trackIndex]) {
        updateChannel(trackIndex, trackData);
        return;
    }
    
    const channelDiv = document.createElement('div');
    channelDiv.className = 'channel-strip';
    channelDiv.dataset.trackIndex = trackIndex;
    channelDiv.id = `channel-${trackIndex}`;
    
    // Проверяем, скрыт ли трек
    if (hiddenTracks[trackIndex]) {
        channelDiv.style.display = 'none';
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
            <div class="fader-value" id="faderValue-${trackIndex}">${volumeToDb(volume)}</div>
        </div>
        
        <div class="channel-controls">
            <button class="channel-btn mute ${isMuted ? 'active' : ''}" 
                    onclick="toggleMute(${trackIndex})">
                <span class="channel-btn-icon">M</span>
                <span class="channel-btn-label">Mute</span>
            </button>
            
            <button class="channel-btn solo ${isSoloed ? 'active' : ''}" 
                    onclick="toggleSolo(${trackIndex})">
                <span class="channel-btn-icon">S</span>
                <span class="channel-btn-label">Solo</span>
            </button>
            
            <button class="channel-btn rec ${isRecordArmed ? 'active' : ''}" 
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
            <div class="pan-value" id="panValue-${trackIndex}">${panToPercent(pan)}</div>
        </div>
        
        <button class="channel-menu-btn" onclick="openChannelMenu(${trackIndex})">
            <span class="channel-btn-icon">⋮</span>
            <span class="channel-btn-label">Управление</span>
        </button>
    `;
    
    addFaderMarkers(channelDiv);
    insertChannelInOrder(channelDiv, trackIndex);
    
    channels[trackIndex] = channelDiv;
    initFader(`fader-${trackIndex}`, volume, trackIndex);
    initPanSlider(`panSlider-${trackIndex}`, trackIndex);
    
    // Настройка drag & drop
    channelDiv.setAttribute('draggable', 'true');
    channelDiv.style.cursor = 'grab';
    
    channelDiv.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({
            type: 'track',
            trackId: trackIndex
        }));
        this.classList.add('dragging');
    });
    
    channelDiv.addEventListener('dragend', function() {
        this.classList.remove('dragging');
    });
    
    vuSmoothing[trackIndex] = {
        current: meterHeight,
        target: meterHeight,
        lastUpdate: Date.now()
    };
}

function updateChannel(trackIndex, trackData) {
    const channelDiv = channels[trackIndex];
    if (!channelDiv) return;
    
    // Применяем видимость
    if (hiddenTracks[trackIndex]) {
        channelDiv.style.display = 'none';
    } else {
        // Проверяем, не находится ли трек в сепараторе
        let inSeparator = false;
        Object.values(separatorSystem.separators).forEach(separator => {
            if (separator.tracks.includes(trackIndex)) {
                inSeparator = true;
            }
        });
        channelDiv.style.display = inSeparator ? 'none' : 'flex';
    }
    
    applyTrackColor(channelDiv, trackData.color);
    
    const nameElement = channelDiv.querySelector('.channel-name');
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
        const targetHeight = Math.min(100, Math.max(0, (peak / 10 + 60) * (100 / 60)));
        
        if (!vuSmoothing[trackIndex]) {
            vuSmoothing[trackIndex] = {
                current: targetHeight,
                target: targetHeight,
                lastUpdate: Date.now()
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
    
    const muteBtn = channelDiv.querySelector('.channel-btn.mute');
    if (muteBtn) {
        muteBtn.classList.toggle('active', isMuted);
    }
    
    const soloBtn = channelDiv.querySelector('.channel-btn.solo');
    if (soloBtn) {
        soloBtn.classList.toggle('active', isSoloed);
    }
    
    const recBtn = channelDiv.querySelector('.channel-btn.rec');
    if (recBtn) {
        recBtn.classList.toggle('active', isRecordArmed);
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
    if (currentMenuChannel === trackIndex) {
        updateChannelMenuButtons(trackIndex);
    }
}

function updateMasterChannel(trackData) {
    if (!masterChannel) return;
    
    const volume = trackData.volume || 1.0;
    const peak = trackData.peak || 0;
    const isMuted = trackData.isMuted || false;
    
    const faderKnob = document.getElementById('masterFader');
    if (faderKnob && !faderKnob.dataset.dragging) {
        const faderPos = volumeToPosition(volume);
        faderKnob.style.bottom = `${faderPos}%`;
    }
    
    const faderValue = document.getElementById('masterFaderValue');
    if (faderValue) {
        faderValue.textContent = volumeToDb(volume);
    }
    
    const meterLevel = document.getElementById('masterMeter');
    if (meterLevel) {
        const targetHeight = Math.min(100, Math.max(0, (peak / 10 + 60) * (100 / 60)));
        
        if (!vuSmoothing['master']) {
            vuSmoothing['master'] = {
                current: targetHeight,
                target: targetHeight,
                lastUpdate: Date.now()
            };
        }
        
        vuSmoothing['master'].target = targetHeight;
        
        if (!vuSmoothing['master'].animationId) {
            animateMasterVUMeter();
        }
    }
    
    const muteBtn = masterChannel.querySelector('.channel-btn.mute');
    if (muteBtn) {
        muteBtn.classList.toggle('active', isMuted);
    }
    
    if (currentMenuChannel === 0) {
        updateChannelMenuButtons(0);
    }
}

function animateVUMeter(trackIndex) {
    if (!vuSmoothing[trackIndex]) return;
    
    const smoothing = vuSmoothing[trackIndex];
    const now = Date.now();
    
    const smoothingFactor = 0.3;
    smoothing.current = smoothing.current + (smoothing.target - smoothing.current) * smoothingFactor;
    
    const meterLevel = document.getElementById(`meter-${trackIndex}`);
    if (meterLevel) {
        meterLevel.style.height = `${smoothing.current}%`;
    }
    
    smoothing.lastUpdate = now;
    
    if (Math.abs(smoothing.current - smoothing.target) > 0.5) {
        smoothing.animationId = requestAnimationFrame(() => animateVUMeter(trackIndex));
    } else {
        smoothing.animationId = null;
    }
}

function animateMasterVUMeter() {
    if (!vuSmoothing['master']) return;
    
    const smoothing = vuSmoothing['master'];
    const now = Date.now();
    
    const smoothingFactor = 0.3;
    smoothing.current = smoothing.current + (smoothing.target - smoothing.current) * smoothingFactor;
    
    const meterLevel = document.getElementById('masterMeter');
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

function insertChannelInOrder(channelDiv, trackIndex) {
    const mixerSection = document.getElementById('mixerSection');
    if (!mixerSection) return;
    
    const allChannels = Array.from(mixerSection.querySelectorAll('.channel-strip:not(.master)'));
    
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
        if (!masterOnLeft && masterChannel) {
            mixerSection.insertBefore(channelDiv, masterChannel);
        } else {
            mixerSection.appendChild(channelDiv);
        }
    }
}

// === ФУНКЦИИ ФЕЙДЕРОВ И СЛАЙДЕРОВ ===
function initFader(faderId, initialValue, trackId) {
    const fader = document.getElementById(faderId);
    if (!fader) return;
    
    let isDragging = false;
    let startY = 0;
    let startBottom = 0;
    let lastSendTime = 0;
    const sendInterval = 50; // Увеличили частоту отправки
    
    fader.addEventListener('click', function(e) {
        if (e.detail === 2) { // Двойной клик
            const newBottom = 75; // 0 dB
            this.style.bottom = `${newBottom}%`;
            
            const volume = positionToVolume(newBottom);
            updateFaderDisplay(trackId, volume);
            
            sendVolumeCommand(trackId, volume);
        }
    });
    
    fader.addEventListener('mousedown', startDrag);
    fader.addEventListener('touchstart', startTouchDrag);
    
    function startDrag(e) {
        isDragging = true;
        fader.dataset.dragging = 'true';
        startY = e.clientY;
        startBottom = parseFloat(fader.style.bottom) || 75;
        e.preventDefault();
        
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', stopDrag);
    }
    
    function startTouchDrag(e) {
        isDragging = true;
        fader.dataset.dragging = 'true';
        startY = e.touches[0].clientY;
        startBottom = parseFloat(fader.style.bottom) || 75;
        e.preventDefault();
        
        document.addEventListener('touchmove', handleTouchDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
        document.addEventListener('touchcancel', stopDrag);
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
        fader.dataset.dragging = 'false';
        
        const finalBottom = parseFloat(fader.style.bottom) || 75;
        const volume = positionToVolume(finalBottom);
        
        sendVolumeCommand(trackId, volume);
        
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('touchmove', handleTouchDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchend', stopDrag);
        document.removeEventListener('touchcancel', stopDrag);
    }
}

function initPanSlider(sliderId, trackIndex) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    
    let isDragging = false;
    let lastSendTime = 0;
    const sendInterval = 50;
    
    slider.addEventListener('mousedown', () => {
        isDragging = true;
        slider.dataset.dragging = 'true';
        document.addEventListener('mousemove', handlePanDrag);
        document.addEventListener('mouseup', stopPanDrag);
    });
    
    slider.addEventListener('touchstart', () => {
        isDragging = true;
        slider.dataset.dragging = 'true';
        document.addEventListener('touchmove', handlePanTouchDrag, { passive: false });
        document.addEventListener('touchend', stopPanDrag);
        document.addEventListener('touchcancel', stopPanDrag);
    });
    
    function handlePanDrag(e) {
        if (!isDragging) return;
        
        const rect = slider.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const value = (percent * 2) - 1;
        
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
        const value = (percent * 2) - 1;
        
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
        slider.dataset.dragging = 'false';
        
        sendPanCommand(trackIndex, parseFloat(slider.value));
        
        document.removeEventListener('mousemove', handlePanDrag);
        document.removeEventListener('touchmove', handlePanTouchDrag);
        document.removeEventListener('mouseup', stopPanDrag);
        document.removeEventListener('touchend', stopPanDrag);
        document.removeEventListener('touchcancel', stopPanDrag);
    }
    
    // Обработка input
    slider.addEventListener('input', function() {
        updatePanDisplay(trackIndex, this.value);
        
        if (!isDragging) {
            clearTimeout(panSliders[trackIndex]);
            panSliders[trackIndex] = setTimeout(() => {
                sendPanCommand(trackIndex, parseFloat(this.value));
            }, 100);
        }
    });
}

function updateFaderDisplay(trackId, volume) {
    const faderValue = trackId === 'master' 
        ? document.getElementById('masterFaderValue')
        : document.getElementById(`faderValue-${trackId}`);
    
    if (faderValue) {
        faderValue.textContent = volumeToDb(volume);
    }
}

function updatePanDisplay(trackIndex, value) {
    const panValue = document.getElementById(`panValue-${trackIndex}`);
    if (panValue) {
        panValue.textContent = panToPercent(parseFloat(value));
    }
}

function sendVolumeCommand(trackId, volume) {
    const command = trackId === 'master'
        ? `SET/TRACK/0/VOL/${volume.toFixed(6)}`
        : `SET/TRACK/${trackId}/VOL/${volume.toFixed(6)}`;
    sendCommand(command);
}

function sendPanCommand(trackIndex, value) {
    sendCommand(`SET/TRACK/${trackIndex}/PAN/${value}`);
}

// === ФУНКЦИИ УПРАВЛЕНИЯ ТРЕКАМИ ===
function toggleMute(trackIndex) {
    sendCommand(`SET/TRACK/${trackIndex}/MUTE/-1`);
    if (currentMenuChannel === trackIndex) {
        setTimeout(() => updateChannelMenuButtons(trackIndex), 50);
    }
}

function toggleSolo(trackIndex) {
    sendCommand(`SET/TRACK/${trackIndex}/SOLO/-1`);
    if (currentMenuChannel === trackIndex) {
        setTimeout(() => updateChannelMenuButtons(trackIndex), 50);
    }
}

function toggleRecord(trackIndex) {
    sendCommand(`SET/TRACK/${trackIndex}/RECARM/-1`);
    if (currentMenuChannel === trackIndex) {
        setTimeout(() => updateChannelMenuButtons(trackIndex), 50);
    }
}

function toggleMasterMute() {
    sendCommand(`SET/TRACK/0/MUTE/-1`);
    if (currentMenuChannel === 0) {
        setTimeout(() => updateChannelMenuButtons(0), 50);
    }
}

function setPan(trackIndex, value) {
    sendCommand(`SET/TRACK/${trackIndex}/PAN/${value}`);
}

function resetPan(trackIndex) {
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
    const textElement = document.getElementById('autoUpdateText');
    textElement.textContent = autoUpdateEnabled ? 'ВКЛ' : 'ВЫКЛ';
    showMessage(`Автообновление: ${autoUpdateEnabled ? 'ВКЛ' : 'ВЫКЛ'}`, "info");
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

function checkConnection() {
    sendCommand("PING");
}

function startPolling() {
    setInterval(() => {
        if (autoUpdateEnabled && isConnected) {
            sendCommand("TRANSPORT");
        }
    }, 200);
    
    setInterval(() => {
        if (autoUpdateEnabled && isConnected) {
            sendCommand("TRACK");
        }
    }, 150);
}

function sendCommand(command) {
    const url = `${REAPER_API_BASE}/${command}`;
    
    fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'text/plain',
            'Cache-Control': 'no-cache'
        },
        mode: 'cors'
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        return response.text();
    })
    .then(data => {
        isConnected = true;
        updateConnectionStatus(true);
        processResponse(data);
    })
    .catch(error => {
        console.error('Ошибка запроса:', error);
        isConnected = false;
        updateConnectionStatus(false);
        
        if (command === "PING") {
            setTimeout(checkConnection, 1000);
        }
    });
}

function processResponse(responseText) {
    if (!responseText) return;
    
    const lines = responseText.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        const parts = trimmed.split('\t');
        const command = parts[0];
        
        switch(command) {
            case 'PING':
                isConnected = true;
                updateConnectionStatus(true);
                break;
                
            case 'TRANSPORT':
                if (parts.length > 1) {
                    const state = parseInt(parts[1]);
                    const time = parts[4] || '00:00.000';
                    const beats = parts[5] || '1.1.00';
                    const bpm = parts[6] || '120.00';
                    const region = parts[8] || '--';
                    
                    updateTransportDisplay(state, time, beats, bpm, region);
                }
                break;
                
            case 'TRACK':
                if (parts.length >= 14) {
                    const trackIndex = parseInt(parts[1]);
                    const trackData = parseTrackData(parts);
                    
                    if (trackIndex === 0) {
                        updateMasterChannel(trackData);
                    } else if (trackIndex > 0) {
                        if (!channels[trackIndex]) {
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
        isRecordArmed: (flags & 64) !== 0
    };
}

function updateTransportDisplay(state, time, beats, bpm, region) {
    transportState = state;
    
    const display = document.getElementById('transportDisplay');
    if (display) {
        display.textContent = `${time} | ${beats}`;
        
        switch(state) {
            case 1:
                display.style.color = '#4CAF50';
                break;
            case 5:
                display.style.color = '#F44336';
                break;
            case 2:
                display.style.color = '#FF9800';
                break;
            default:
                display.style.color = '#aaa';
        }
    }
    
    const bpmDisplay = document.getElementById('bpmDisplay');
    if (bpmDisplay && bpm) {
        projectBPM = parseFloat(bpm).toFixed(2);
        bpmDisplay.textContent = `BPM: ${projectBPM}`;
    }
    
    const regionDisplay = document.getElementById('regionDisplay');
    if (regionDisplay && region) {
        currentRegion = region;
        regionDisplay.textContent = region;
    }
}

function updateConnectionStatus(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    isConnected = connected;
    
    if (connected) {
        dot.className = 'status-dot connected';
        text.textContent = 'Подключено';
        text.style.color = '#4CAF50';
    } else {
        dot.className = 'status-dot';
        text.textContent = 'Отключено';
        text.style.color = '#F44336';
    }
}

function updateStatus(message, color) {
    const text = document.getElementById('statusText');
    if (text) {
        text.textContent = message;
        text.style.color = color;
        
        setTimeout(() => {
            if (isConnected) {
                text.textContent = 'Подключено';
                text.style.color = '#4CAF50';
            } else {
                text.textContent = 'Отключено';
                text.style.color = '#F44336';
            }
        }, 2000);
    }
}

function showMessage(message, type) {
    updateStatus(message, type === 'info' ? '#2196F3' : '#F44336');
}

// === UI ФУНКЦИИ ===
function toggleControlPanel() {
    const panel = document.getElementById('controlPanel');
    panel.classList.toggle('active');
}

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
    isFullscreen = !!(document.fullscreenElement || 
                     document.webkitFullscreenElement || 
                     document.mozFullScreenElement || 
                     document.msFullscreenElement);
    
    if (isFullscreen) {
        console.log('Полноэкранный режим включен');
    } else {
        console.log('Полноэкранный режим выключен');
    }
}

function toggleMasterChannel() {
    masterChannelVisible = !masterChannelVisible;
    const textElement = document.getElementById('masterToggleText');
    textElement.textContent = masterChannelVisible ? 'ВКЛ' : 'ВЫКЛ';
    
    const floatingBtn = document.getElementById('floatingSettingsBtn');
    
    if (masterChannelVisible) {
        if (masterChannel) masterChannel.style.display = 'flex';
        floatingBtn.style.display = 'none';
    } else {
        if (masterChannel) masterChannel.style.display = 'none';
        floatingBtn.style.display = 'flex';
    }
    
    saveSettings();
}

function toggleMasterPosition() {
    masterOnLeft = !masterOnLeft;
    const textElement = document.getElementById('masterPositionText');
    textElement.textContent = masterOnLeft ? 'Слева' : 'Справа';
    
    moveMasterChannel();
    saveSettings();
}

function moveMasterChannel() {
    const mixerSection = document.getElementById('mixerSection');
    if (!masterChannel || !mixerSection) return;
    
    masterChannel.remove();
    
    if (masterOnLeft) {
        mixerSection.prepend(masterChannel);
    } else {
        mixerSection.appendChild(masterChannel);
    }
}

function setupSwipeToClose() {
    const panel = document.getElementById('controlPanel');
    let startX = 0;
    let startY = 0;
    
    panel.addEventListener('touchstart', function(e) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    });
    
    panel.addEventListener('touchmove', function(e) {
        if (!startX || !startY) return;
        
        const diffX = e.touches[0].clientX - startX;
        const diffY = e.touches[0].clientY - startY;
        
        if (diffX > 100 && Math.abs(diffY) < 50) {
            toggleControlPanel();
            startX = 0;
            startY = 0;
        }
    });
    
    panel.addEventListener('touchend', function() {
        startX = 0;
        startY = 0;
    });
}

// === НАСТРОЙКИ И ЛОКАЛЬНОЕ ХРАНИЛИЩЕ ===
function saveSettings() {
    const settings = {
        autoUpdateEnabled: autoUpdateEnabled,
        masterOnLeft: masterOnLeft,
        masterChannelVisible: masterChannelVisible,
        hiddenTracks: hiddenTracks
    };
    localStorage.setItem('reaperVV_settings', JSON.stringify(settings));
}

function loadSettings() {
    const savedSettings = localStorage.getItem('reaperVV_settings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            
            autoUpdateEnabled = settings.autoUpdateEnabled !== undefined ? settings.autoUpdateEnabled : true;
            masterOnLeft = settings.masterOnLeft !== undefined ? settings.masterOnLeft : true;
            masterChannelVisible = settings.masterChannelVisible !== undefined ? settings.masterChannelVisible : true;
            hiddenTracks = settings.hiddenTracks || {};
            
            const autoUpdateText = document.getElementById('autoUpdateText');
            if (autoUpdateText) {
                autoUpdateText.textContent = autoUpdateEnabled ? 'ВКЛ' : 'ВЫКЛ';
            }
            
            const masterToggleText = document.getElementById('masterToggleText');
            if (masterToggleText) {
                masterToggleText.textContent = masterChannelVisible ? 'ВКЛ' : 'ВЫКЛ';
            }
            
            const masterPositionText = document.getElementById('masterPositionText');
            if (masterPositionText) {
                masterPositionText.textContent = masterOnLeft ? 'Слева' : 'Справа';
            }
            
            const floatingBtn = document.getElementById('floatingSettingsBtn');
            if (masterChannel) {
                masterChannel.style.display = masterChannelVisible ? 'flex' : 'none';
            }
            floatingBtn.style.display = masterChannelVisible ? 'none' : 'flex';
            
        } catch (e) {
            console.error('Ошибка загрузки настроек:', e);
        }
    }
}

// === МЕНЮ КАНАЛА ===
function openChannelMenu(trackIndex) {
    currentMenuChannel = trackIndex;
    const channelDiv = channels[trackIndex] || (trackIndex === 0 ? masterChannel : null);
    if (!channelDiv) return;
    
    const trackName = channelDiv.querySelector('.channel-name').textContent;
    const menuTitle = trackIndex === 0 ? 'MASTER' : `Канал ${trackIndex}`;
    
    document.getElementById('channelMenuTitle').textContent = `${menuTitle}: ${trackName}`;
    
    const menuControls = document.getElementById('channelMenuControls');
    menuControls.innerHTML = '';
    
    const buttons = [
        { id: 'mute', label: 'Mute', icon: 'M' },
        { id: 'solo', label: 'Solo', icon: 'S' },
        { id: 'rec', label: 'Rec', icon: 'R' }
    ];
    
    buttons.forEach(btn => {
        if (trackIndex === 0 && (btn.id === 'solo' || btn.id === 'rec')) {
            return;
        }
        
        const button = document.createElement('button');
        button.className = `channel-btn ${btn.id}`;
        
        if (trackIndex === 0 && btn.id === 'mute') {
            button.setAttribute('onclick', 'toggleMasterMute()');
        } else if (btn.id === 'mute') {
            button.setAttribute('onclick', `toggleMute(${trackIndex})`);
        } else if (btn.id === 'solo') {
            button.setAttribute('onclick', `toggleSolo(${trackIndex})`);
        } else if (btn.id === 'rec') {
            button.setAttribute('onclick', `toggleRecord(${trackIndex})`);
        }
        
        const isActive = channelDiv.querySelector(`.channel-btn.${btn.id}`)?.classList.contains('active');
        if (isActive) {
            button.classList.add('active');
        }
        
        button.innerHTML = `
            <span class="channel-btn-icon">${btn.icon}</span>
            <span class="channel-btn-label">${btn.label}</span>
        `;
        
        menuControls.appendChild(button);
    });
    
    const closeButton = document.createElement('button');
    closeButton.className = 'channel-btn';
    closeButton.setAttribute('onclick', 'closeChannelMenu()');
    closeButton.style.gridColumn = 'span 2';
    closeButton.innerHTML = `
        <span class="channel-btn-icon">✕</span>
        <span class="channel-btn-label">Закрыть</span>
    `;
    menuControls.appendChild(closeButton);
    
    updateChannelMenuButtons(trackIndex);
    
    document.getElementById('channelMenuOverlay').style.display = 'flex';
}

function updateChannelMenuButtons(trackIndex) {
    if (currentMenuChannel !== trackIndex) return;
    
    const channelDiv = channels[trackIndex] || (trackIndex === 0 ? masterChannel : null);
    if (!channelDiv) return;
    
    const menuControls = document.getElementById('channelMenuControls');
    if (!menuControls) return;
    
    const buttons = menuControls.querySelectorAll('.channel-btn');
    buttons.forEach(button => {
        const btnType = button.classList.contains('mute') ? 'mute' : 
                       button.classList.contains('solo') ? 'solo' : 
                       button.classList.contains('rec') ? 'rec' : null;
        
        if (btnType && btnType !== 'close') {
            const isActive = channelDiv.querySelector(`.channel-btn.${btnType}`)?.classList.contains('active');
            button.classList.toggle('active', isActive);
        }
    });
    
    const menuVolumeSlider = document.getElementById('channelMenuVolumeSlider');
    const menuVolumeValue = document.getElementById('channelMenuVolumeValue');
    if (menuVolumeSlider && menuVolumeValue) {
        const faderKnob = document.getElementById(trackIndex === 0 ? 'masterFader' : `fader-${trackIndex}`);
        if (faderKnob) {
            const currentPos = parseFloat(faderKnob.style.bottom) || 75;
            menuVolumeSlider.value = currentPos;
            const volume = positionToVolume(currentPos);
            menuVolumeValue.textContent = volumeToDb(volume);
        }
    }
    
    const menuPanSlider = document.getElementById('channelMenuPanSlider');
    const menuPanValue = document.getElementById('channelMenuPanValue');
    if (trackIndex !== 0 && menuPanSlider && menuPanValue) {
        const panSlider = channelDiv.querySelector('.pan-slider');
        if (panSlider) {
            menuPanSlider.value = panSlider.value;
            menuPanValue.textContent = panToPercent(parseFloat(panSlider.value));
        }
    }
}

function closeChannelMenu() {
    document.getElementById('channelMenuOverlay').style.display = 'none';
    currentMenuChannel = null;
}

function setupMenuSliders() {
    const menuVolumeSlider = document.getElementById('channelMenuVolumeSlider');
    const menuVolumeValue = document.getElementById('channelMenuVolumeValue');
    const menuPanSlider = document.getElementById('channelMenuPanSlider');
    const menuPanValue = document.getElementById('channelMenuPanValue');
    
    if (menuVolumeSlider && menuVolumeValue) {
        let isDragging = false;
        let lastSendTime = 0;
        const sendInterval = 50;
        
        menuVolumeSlider.addEventListener('mousedown', function() {
            isDragging = true;
            menuVolumeDragging = true;
            lastSendTime = Date.now();
        });
        
        menuVolumeSlider.addEventListener('touchstart', function() {
            isDragging = true;
            menuVolumeDragging = true;
            lastSendTime = Date.now();
        });
        
        const handleVolumeChange = function(value) {
            const volume = positionToVolume(parseFloat(value));
            menuVolumeValue.textContent = volumeToDb(volume);
            
            if (currentMenuChannel !== null) {
                const faderId = currentMenuChannel === 0 ? 'masterFader' : `fader-${currentMenuChannel}`;
                const fader = document.getElementById(faderId);
                if (fader) {
                    fader.style.bottom = `${value}%`;
                }
                
                const faderValueId = currentMenuChannel === 0 ? 'masterFaderValue' : `faderValue-${currentMenuChannel}`;
                const faderValue = document.getElementById(faderValueId);
                if (faderValue) {
                    faderValue.textContent = volumeToDb(volume);
                }
            }
        };
        
        menuVolumeSlider.addEventListener('input', function(e) {
            const value = e.target.value;
            handleVolumeChange(value);
            
            if (isDragging) {
                const now = Date.now();
                if (now - lastSendTime > sendInterval) {
                    const volume = positionToVolume(parseFloat(value));
                    sendVolumeCommand(currentMenuChannel === 0 ? 'master' : currentMenuChannel, volume);
                    lastSendTime = now;
                }
            }
        });
        
        menuVolumeSlider.addEventListener('change', function() {
            const volume = positionToVolume(parseFloat(this.value));
            sendVolumeCommand(currentMenuChannel === 0 ? 'master' : currentMenuChannel, volume);
        });
        
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                menuVolumeDragging = false;
                const volume = positionToVolume(parseFloat(menuVolumeSlider.value));
                sendVolumeCommand(currentMenuChannel === 0 ? 'master' : currentMenuChannel, volume);
            }
        });
        
        document.addEventListener('touchend', function() {
            if (isDragging) {
                isDragging = false;
                menuVolumeDragging = false;
                const volume = positionToVolume(parseFloat(menuVolumeSlider.value));
                sendVolumeCommand(currentMenuChannel === 0 ? 'master' : currentMenuChannel, volume);
            }
        });
    }
    
    if (menuPanSlider && menuPanValue) {
        let isDragging = false;
        let lastSendTime = 0;
        const sendInterval = 50;
        
        menuPanSlider.addEventListener('mousedown', function() {
            isDragging = true;
            menuPanDragging = true;
            lastSendTime = Date.now();
        });
        
        menuPanSlider.addEventListener('touchstart', function() {
            isDragging = true;
            menuPanDragging = true;
            lastSendTime = Date.now();
        });
        
        menuPanSlider.addEventListener('input', function(e) {
            const value = e.target.value;
            menuPanValue.textContent = panToPercent(parseFloat(value));
            
            if (currentMenuChannel !== null && currentMenuChannel !== 0) {
                const panSliderId = `panSlider-${currentMenuChannel}`;
                const panSlider = document.getElementById(panSliderId);
                if (panSlider) {
                    panSlider.value = value;
                }
                
                const panValueId = `panValue-${currentMenuChannel}`;
                const panValue = document.getElementById(panValueId);
                if (panValue) {
                    panValue.textContent = panToPercent(parseFloat(value));
                }
            }
            
            if (isDragging && currentMenuChannel !== null && currentMenuChannel !== 0) {
                const now = Date.now();
                if (now - lastSendTime > sendInterval) {
                    sendPanCommand(currentMenuChannel, parseFloat(value));
                    lastSendTime = now;
                }
            }
        });
        
        menuPanSlider.addEventListener('change', function() {
            if (currentMenuChannel !== null && currentMenuChannel !== 0) {
                sendPanCommand(currentMenuChannel, parseFloat(this.value));
            }
        });
        
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                menuPanDragging = false;
                if (currentMenuChannel !== null && currentMenuChannel !== 0) {
                    sendPanCommand(currentMenuChannel, parseFloat(menuPanSlider.value));
                }
            }
        });
        
        document.addEventListener('touchend', function() {
            if (isDragging) {
                isDragging = false;
                menuPanDragging = false;
                if (currentMenuChannel !== null && currentMenuChannel !== 0) {
                    sendPanCommand(currentMenuChannel, parseFloat(menuPanSlider.value));
                }
            }
        });
    }
}

// === УПРАВЛЕНИЕ ТРЕКАМИ ===
function openTrackManager() {
    const trackList = document.getElementById('trackList');
    trackList.innerHTML = '';
    
    const trackIndices = Object.keys(channels)
        .map(key => parseInt(key))
        .filter(index => index > 0)
        .sort((a, b) => a - b);
    
    if (trackIndices.length === 0) {
        trackList.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">Треки еще не загружены</div>';
    } else {
        trackIndices.forEach(trackIndex => {
            const channelDiv = channels[trackIndex];
            if (!channelDiv) return;
            
            const trackName = channelDiv.querySelector('.channel-name').textContent;
            const isVisible = !hiddenTracks[trackIndex];
            
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            trackItem.innerHTML = `
                <input type="checkbox" class="track-checkbox" ${isVisible ? 'checked' : ''} 
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
    
    document.getElementById('trackManagerOverlay').style.display = 'flex';
}

function closeTrackManager() {
    document.getElementById('trackManagerOverlay').style.display = 'none';
}

function toggleTrackVisibility(trackIndex, isVisible) {
    hiddenTracks[trackIndex] = !isVisible;
    
    const channelDiv = channels[trackIndex];
    if (channelDiv) {
        channelDiv.style.display = isVisible ? 'flex' : 'none';
    }
}

function updateTrackName(trackIndex, newName) {
    sendCommand(`SET/TRACK/${trackIndex}/NAME/${encodeURIComponent(newName)}`);
}

function selectAllTracks() {
    const checkboxes = document.querySelectorAll('.track-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        const trackIndex = parseInt(checkbox.dataset.trackIndex);
        hiddenTracks[trackIndex] = false;
        
        const channelDiv = channels[trackIndex];
        if (channelDiv) {
            channelDiv.style.display = 'flex';
        }
    });
}

function deselectAllTracks() {
    const checkboxes = document.querySelectorAll('.track-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        const trackIndex = parseInt(checkbox.dataset.trackIndex);
        hiddenTracks[trackIndex] = true;
        
        const channelDiv = channels[trackIndex];
        if (channelDiv) {
            channelDiv.style.display = 'none';
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
document.addEventListener('DOMContentLoaded', function() {
    console.log('ReaperVV загружен');
    
    createMasterChannel();
    
    setTimeout(() => {
        startSystem();
    }, 300);
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    setupSwipeToClose();
});
// === СИСТЕМА СЕПАРАТОРОВ - ИСПРАВЛЕННЫЙ КОД ===
function handleSeparatorDrop(e, separatorId) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    try {
        const dataText = e.dataTransfer.getData('text/plain');
        if (!dataText) return;
        
        const data = JSON.parse(dataText);
        if (!data) return;
        
        if (data.type === 'track' && data.trackId) {
            addTrackToSeparator(data.trackId, separatorId);
        } else if (data.type === 'separator' && data.separatorId && data.separatorId !== separatorId) {
            moveSeparator(data.separatorId, separatorId);
        }
    } catch (error) {
        console.error('Ошибка при drop:', error);
    }
}

function moveSeparator(sourceId, targetId) {
    const sourceEl = document.querySelector(`[data-separator-id="${sourceId}"]`);
    const targetEl = document.querySelector(`[data-separator-id="${targetId}"]`);
    
    if (!sourceEl || !targetEl || sourceEl === targetEl) {
        console.warn('Не удалось найти сепараторы для перемещения');
        return;
    }
    
    const mixerSection = document.getElementById('mixerSection');
    if (!mixerSection) {
        console.error('Секция микшера не найдена');
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
    
    const separatorEl = document.createElement('div');
    separatorEl.className = 'simple-separator';
    separatorEl.dataset.separatorId = separatorId;
    separatorEl.draggable = true;
    
    const tracksCount = separator.tracks.length;
    const tracksText = tracksCount === 0 ? 'Пусто' : 
                      tracksCount === 1 ? '1 трек' : 
                      `${tracksCount} трека`;
    
    separatorEl.innerHTML = `
        <div class="separator-header">
            <div class="separator-title" onclick="toggleSeparatorCollapse('${separatorId}')">
                ${separator.name}
            </div>
            <button class="separator-edit-btn" onclick="editSeparator('${separatorId}'); event.stopPropagation();">✎</button>
        </div>
        <div class="separator-content" style="${separator.collapsed ? 'display: none;' : ''}">
            <div class="separator-empty" ${tracksCount > 0 ? 'style="display: none;"' : ''}>
                <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📁</div>
                <div>Перетащите треки сюда</div>
            </div>
        </div>
        <div class="separator-controls" ${tracksCount === 0 ? 'style="display: none;"' : ''}>
            <button class="separator-control-btn" onclick="expandAllInSeparator('${separatorId}'); event.stopPropagation();">Показать</button>
            <button class="separator-control-btn" onclick="collapseAllInSeparator('${separatorId}'); event.stopPropagation();">Скрыть</button>
        </div>
    `;
    
    // Drag & drop события
    separatorEl.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('drag-over');
    });
    
    separatorEl.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
    });
    
    separatorEl.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        handleSeparatorDrop(e, separatorId);
    });
    
    // Drag для перемещения сепаратора
    separatorEl.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({
            type: 'separator',
            separatorId: separatorId
        }));
        this.classList.add('dragging');
    });
    
    separatorEl.addEventListener('dragend', function() {
        this.classList.remove('dragging');
    });
    
    // Добавляем в микшер
    const mixerSection = document.getElementById('mixerSection');
    if (mixerSection) {
        if (masterOnLeft && masterChannel) {
            mixerSection.insertBefore(separatorEl, masterChannel.nextSibling);
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
    
    const separatorEl = document.querySelector(`[data-separator-id="${separatorId}"]`);
    if (!separatorEl) return;
    
    const contentEl = separatorEl.querySelector('.separator-content');
    const emptyEl = separatorEl.querySelector('.separator-empty');
    const controlsEl = separatorEl.querySelector('.separator-controls');
    
    if (!contentEl || !emptyEl || !controlsEl) return;
    
    // Обновляем видимость элементов
    const hasTracks = separator.tracks.length > 0;
    controlsEl.style.display = hasTracks ? 'flex' : 'none';
    emptyEl.style.display = hasTracks ? 'none' : 'flex';
    
    // Удаляем старые треки (кроме empty элемента)
    const existingTracks = contentEl.querySelectorAll('.separator-track');
    existingTracks.forEach(track => {
        if (!track.classList.contains('separator-empty')) {
            track.remove();
        }
    });
    
    // Добавляем треки
    separator.tracks.forEach(trackId => {
        const trackDiv = document.createElement('div');
        trackDiv.className = 'separator-track';
        trackDiv.draggable = true;
        
        const trackData = getTrackInfo(trackId);
        
        trackDiv.innerHTML = `
            <div class="track-number">${trackId}</div>
            <div class="track-name">${trackData.name || `Трек ${trackId}`}</div>
            <div class="track-remove" onclick="event.stopPropagation(); removeTrackFromSeparator(${trackId}, '${separatorId}');">×</div>
        `;
        
        // Drag для трека внутри сепаратора
        trackDiv.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'track',
                trackId: trackId
            }));
            this.classList.add('dragging');
        });
        
        trackDiv.addEventListener('dragend', function() {
            this.classList.remove('dragging');
        });
        
        // Клик для открытия меню трека
        trackDiv.addEventListener('click', function(e) {
            if (!e.target.classList.contains('track-remove')) {
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
    Object.keys(separatorSystem.separators).forEach(id => {
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
    const channelDiv = channels[trackId];
    if (channelDiv) {
        channelDiv.style.display = 'none';
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
    const channelDiv = channels[trackId];
    if (channelDiv) {
        channelDiv.style.display = 'flex';
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
    
    const channelDiv = channels[trackId];
    const info = {
        name: channelDiv ? 
            (channelDiv.querySelector('.channel-name')?.textContent || `Трек ${trackId}`) : 
            `Трек ${trackId}`
    };
    
    trackInfoCache[trackId] = info;
    return info;
}

// Очистка кэша при обновлении треков
function clearTrackInfoCache() {
    Object.keys(trackInfoCache).forEach(key => {
        delete trackInfoCache[key];
    });
}

// Обновляем инициализацию сепараторов
function initSeparatorSystem() {
    console.log('🔄 Инициализация системы сепараторов...');
    
    // Загружаем настройки
    const savedSettings = localStorage.getItem('vv1_separator_system');
    if (savedSettings) {
        try {
            Object.assign(separatorSystem, JSON.parse(savedSettings));
        } catch (e) {
            console.warn('Ошибка загрузки настроек сепараторов:', e);
            separatorSystem.enabled = true;
            separatorSystem.syncWithReaper = true;
        }
    }
    
    // Загружаем сепараторы
    const savedSeparators = localStorage.getItem('vv1_separators');
    if (savedSeparators) {
        try {
            const data = JSON.parse(savedSeparators);
            separatorSystem.separators = data.separators || {};
            separatorSystem.nextId = data.nextId || 1;
        } catch (e) {
            console.warn('Ошибка загрузки сепараторов:', e);
            separatorSystem.separators = {};
            separatorSystem.nextId = 1;
        }
    }
    
    // Обновляем интерфейс
    updateSeparatorUI();
    
    // Восстанавливаем сепараторы с задержкой
    setTimeout(() => {
        Object.keys(separatorSystem.separators).forEach(id => {
            createSeparatorElement(id);
        });
        console.log(`✅ Загружено ${Object.keys(separatorSystem.separators).length} сепараторов`);
    }, 300);
    
    console.log('✅ Система сепараторов инициализирована');
}

// Добавляем обработку drag & drop для микшерной секции
function setupMixerSectionDrop() {
    const mixerSection = document.getElementById('mixerSection');
    if (!mixerSection) return;
    
    mixerSection.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('drop-zone');
    });
    
    mixerSection.addEventListener('dragleave', function() {
        this.classList.remove('drop-zone');
    });
    
    mixerSection.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drop-zone');
        
        try {
            const dataText = e.dataTransfer.getData('text/plain');
            if (!dataText) return;
            
            const data = JSON.parse(dataText);
            if (data.type === 'track' && data.trackId) {
                // Удаляем трек из всех сепараторов
                Object.keys(separatorSystem.separators).forEach(separatorId => {
                    removeTrackFromSeparator(data.trackId, separatorId);
                });
            }
        } catch (error) {
            console.error('Ошибка при drop в микшер:', error);
        }
    });
}

// Обновляем инициализацию системы
document.addEventListener('DOMContentLoaded', function() {
    console.log('ReaperVV загружен');
    
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