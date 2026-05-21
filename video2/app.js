/**
 * WebRTC & WebCodecs Capability Analyzer - UI Controller
 * Binds controls, manages grids, handles interactions, and controls view state.
 */

import { CODECS, SCALABILITY_MODES, RESOLUTIONS } from './codec-utils.js?v=2';
import { CapabilityTestEngine } from './tests-engine.js?v=2';

// Initialize execution engine
const engine = new CapabilityTestEngine();
let suiteResults = [];

// DOM Element Cache
const elements = {
    cfgWebCodecs: document.getElementById('cfgWebCodecs'),
    cfgWebRTC: document.getElementById('cfgWebRTC'),
    
    codecH265: document.getElementById('codecH265'),
    codecVP9: document.getElementById('codecVP9'),
    codecAV1: document.getElementById('codecAV1'),
    codecH264: document.getElementById('codecH264'),
    codecVP8: document.getElementById('codecVP8'),

    hwPreferHardware: document.getElementById('hwPreferHardware'),
    hwPreferSoftware: document.getElementById('hwPreferSoftware'),
    hwNoPreference: document.getElementById('hwNoPreference'),
    modeSinglecast: document.getElementById('modeSinglecast'),
    modeSimulcast: document.getElementById('modeSimulcast'),

    res1080p: document.getElementById('res1080p'),
    res720p: document.getElementById('res720p'),
    res360p: document.getElementById('res360p'),
    res180p: document.getElementById('res180p'),

    scalabilityContainer: document.getElementById('scalabilityContainer'),
    btnSelectAllScalability: document.getElementById('btnSelectAllScalability'),
    btnSelectNoneScalability: document.getElementById('btnSelectNoneScalability'),

    cfgConcurrency: document.getElementById('cfgConcurrency'),
    cfgTimeout: document.getElementById('cfgTimeout'),

    btnRunSuite: document.getElementById('btnRunSuite'),
    btnCancelSuite: document.getElementById('btnCancelSuite'),
    btnResetConfig: document.getElementById('btnResetConfig'),

    btnViewMatrix: document.getElementById('btnViewMatrix'),
    btnViewList: document.getElementById('btnViewList'),
    btnExportJSON: document.getElementById('btnExportJSON'),

    matrixViewContainer: document.getElementById('matrixViewContainer'),
    listViewContainer: document.getElementById('listViewContainer'),
    listGrid: document.getElementById('listGrid'),
    listSearchInput: document.getElementById('listSearchInput'),
    listStatusFilter: document.getElementById('listStatusFilter'),

    statsPendingCount: document.getElementById('statPendingCount'),
    statsTestingCount: document.getElementById('statTestingCount'),
    statsPassedCount: document.getElementById('statPassedCount'),
    statsFailedCount: document.getElementById('statFailedCount'),
    statsUnsupportedCount: document.getElementById('statUnsupportedCount'),

    // Modal
    detailModal: document.getElementById('detailModal'),
    btnModalClose: document.getElementById('btnModalClose'),
    btnModalRetry: document.getElementById('btnModalRetry'),
    modalTitle: document.getElementById('modalTitle'),
    modalCodec: document.getElementById('modalCodec'),
    modalApiType: document.getElementById('modalApiType'),
    modalResolution: document.getElementById('modalResolution'),
    modalScalability: document.getElementById('modalScalability'),
    modalHwPref: document.getElementById('modalHwPref'),
    modalStatus: document.getElementById('modalStatus'),
    modalLogs: document.getElementById('modalLogs'),
    modalErrorSection: document.getElementById('modalErrorSection'),
    modalErrorText: document.getElementById('modalErrorText'),
    modalPayload: document.getElementById('modalPayload'),
    modalWarningBox: document.getElementById('modalWarningBox'),
    modalContrastSection: document.getElementById('modalContrastSection'),
    modalContrastBody: document.getElementById('modalContrastBody'),
    modalTimelineSection: document.getElementById('modalTimelineSection'),
    modalTimelineContainer: document.getElementById('modalTimelineContainer'),

    toastContainer: document.getElementById('toastContainer')
};

// Initialize setup
document.addEventListener('DOMContentLoaded', () => {
    runDiagnostics();
    populateScalabilityCheckboxes();
    bindEvents();
    loadSelectionsFromLocalStorage(); // Load saved configurations on startup!
});

/**
 * Dynamically builds checkboxes for scalability modes
 */
function populateScalabilityCheckboxes() {
    elements.scalabilityContainer.replaceChildren();
    
    SCALABILITY_MODES.forEach(mode => {
        const label = document.createElement('label');
        label.className = 'checkbox-btn';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = mode;
        input.checked = ['L1T1', 'L1T2', 'L1T3'].includes(mode); // Default selections
        input.addEventListener('change', saveSelectionsToLocalStorage); // Auto-save on toggle
        
        const span = document.createElement('span');
        span.textContent = mode;
        
        label.appendChild(input);
        label.appendChild(span);
        elements.scalabilityContainer.appendChild(label);
    });
}

/**
 * Configures click listeners and view controls
 */
function bindEvents() {
    // Scalability select all/none
    elements.btnSelectAllScalability.addEventListener('click', () => {
        toggleAllScalability(true);
        saveSelectionsToLocalStorage();
    });
    elements.btnSelectNoneScalability.addEventListener('click', () => {
        toggleAllScalability(false);
        saveSelectionsToLocalStorage();
    });

    // Navigation view toggle
    elements.btnViewMatrix.addEventListener('click', () => switchView('matrix'));
    elements.btnViewList.addEventListener('click', () => switchView('list'));

    // Runner commands
    elements.btnRunSuite.addEventListener('click', startExecution);
    elements.btnCancelSuite.addEventListener('click', cancelExecution);
    elements.btnResetConfig.addEventListener('click', resetToDefaultConfig);

    // Filters & Exports
    elements.listSearchInput.addEventListener('input', refreshListView);
    elements.listStatusFilter.addEventListener('change', refreshListView);
    elements.btnExportJSON.addEventListener('click', exportResultsToJSON);

    // Close Modal
    elements.btnModalClose.addEventListener('click', closeModal);
    elements.detailModal.addEventListener('click', (e) => {
        if (e.target === elements.detailModal) closeModal();
    });
    elements.btnModalRetry.addEventListener('click', retryCurrentModalTest);

    // Bind auto-save listeners to all sidebar controls
    const configInputs = document.querySelectorAll('.config-panel input, .config-panel select');
    configInputs.forEach(input => {
        input.addEventListener('change', saveSelectionsToLocalStorage);
    });

    // Hook up test engine listeners
    engine.onProgressUpdate = handleProgressUpdate;
    engine.onTestStarted = handleTestStarted;
    engine.onTestCompleted = handleTestCompleted;
    engine.onSuiteFinished = handleSuiteFinished;
}

function toggleAllScalability(checked) {
    const inputs = elements.scalabilityContainer.querySelectorAll('input[type="checkbox"]');
    inputs.forEach(input => {
        input.checked = checked;
    });
}

function switchView(view) {
    if (view === 'matrix') {
        elements.btnViewMatrix.classList.add('active');
        elements.btnViewList.classList.remove('active');
        elements.matrixViewContainer.classList.add('matrix-active');
        elements.matrixViewContainer.classList.remove('list-hidden');
        elements.listViewContainer.classList.add('list-hidden');
        elements.listViewContainer.classList.remove('matrix-active');
    } else {
        elements.btnViewMatrix.classList.remove('active');
        elements.btnViewList.classList.add('active');
        elements.matrixViewContainer.classList.remove('matrix-active');
        elements.matrixViewContainer.classList.add('list-hidden');
        elements.listViewContainer.classList.remove('list-hidden');
        elements.listViewContainer.classList.add('matrix-active');
    }
}

/**
 * Collects user configurations and triggers the test execution engine
 */
async function startExecution() {
    const selections = gatherSelections();
    
    if (selections.apiTypes.length === 0) {
        showToast('Select at least one API Type to test (WebCodecs/WebRTC).', 'failed');
        return;
    }
    if (selections.codecs.length === 0) {
        showToast('Select at least one video codec.', 'failed');
        return;
    }
    if (selections.resolutions.length === 0) {
        showToast('Select at least one target resolution.', 'failed');
        return;
    }

    // Configure UI state
    elements.btnRunSuite.disabled = true;
    elements.btnCancelSuite.disabled = false;
    elements.btnExportJSON.disabled = true;

    // Clear and prime UI views
    buildMatrixShell(selections);
    elements.listGrid.replaceChildren();
    suiteResults = [];

    const settings = {
        concurrency: elements.cfgConcurrency.value,
        timeout: elements.cfgTimeout.value
    };

    showToast('Capability Analyzer suite run initiated.', 'info');
    
    try {
        await engine.runSuite(selections, settings);
    } catch (e) {
        showToast(`Suite execution failure: ${e.message}`, 'failed');
    }
}

function cancelExecution() {
    engine.cancel();
    elements.btnRunSuite.disabled = false;
    elements.btnCancelSuite.disabled = true;
    showToast('Execution aborted.', 'failed');
}

/**
 * Scrapes checked options from control side-panel
 */
function gatherSelections() {
    const apiTypes = [];
    if (elements.cfgWebCodecs.checked) apiTypes.push('WebCodecs');
    if (elements.cfgWebRTC.checked) apiTypes.push('WebRTC');

    const codecs = [];
    if (elements.codecH265.checked) codecs.push('H265');
    if (elements.codecVP9.checked) codecs.push('VP9');
    if (elements.codecAV1.checked) codecs.push('AV1');
    if (elements.codecH264.checked) codecs.push('H264');
    if (elements.codecVP8.checked) codecs.push('VP8');

    const hardwarePrefs = [];
    if (elements.hwPreferHardware.checked) hardwarePrefs.push('prefer-hardware');
    if (elements.hwPreferSoftware.checked) hardwarePrefs.push('prefer-software');
    if (elements.hwNoPreference.checked) hardwarePrefs.push('no-preference');

    const resolutions = [];
    if (elements.res1080p.checked) resolutions.push('1080p');
    if (elements.res720p.checked) resolutions.push('720p');
    if (elements.res360p.checked) resolutions.push('360p');
    if (elements.res180p.checked) resolutions.push('180p');

    const scalabilityModes = [];
    const scaleInputs = elements.scalabilityContainer.querySelectorAll('input[type="checkbox"]:checked');
    scaleInputs.forEach(input => {
        scalabilityModes.push(input.value);
    });

    const transmissionModes = [];
    if (elements.modeSinglecast.checked) transmissionModes.push('singlecast');
    if (elements.modeSimulcast.checked) transmissionModes.push('simulcast');

    return { apiTypes, codecs, hardwarePrefs, resolutions, scalabilityModes, transmissionModes };
}

/**
 * Sets up dynamic grids and tables structure before execution begins
 */
function buildMatrixShell(selections) {
    elements.matrixViewContainer.replaceChildren();

    if (selections.apiTypes.includes('WebCodecs')) {
        const wcCard = document.createElement('div');
        wcCard.className = 'matrix-table-card';
        
        const title = document.createElement('h3');
        title.className = 'matrix-card-title';
        title.textContent = 'WebCodecs API Capabilities Matrix';
        wcCard.appendChild(title);

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'matrix-table-wrapper';

        const table = document.createElement('table');
        table.className = 'matrix-table';

        // 1. Header Row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        const thLabel = document.createElement('th');
        thLabel.textContent = 'Codec (Hardware Preference)';
        headerRow.appendChild(thLabel);

        // Create resolution + scalability mode headers
        const colCombos = [];
        selections.resolutions.forEach(res => {
            const modes = selections.scalabilityModes.length > 0 ? selections.scalabilityModes : [null];
            modes.forEach(mode => {
                colCombos.push({ res, mode });
                const th = document.createElement('th');
                
                const divRes = document.createElement('div');
                divRes.className = 'hdr-res';
                divRes.textContent = res;
                th.appendChild(divRes);

                const divMode = document.createElement('div');
                divMode.className = 'hdr-mode';
                divMode.textContent = mode || 'Default';
                th.appendChild(divMode);

                headerRow.appendChild(th);
            });
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // 2. Body Rows (Codec + HwPref)
        const tbody = document.createElement('tbody');
        selections.codecs.forEach(codecKey => {
            selections.hardwarePrefs.forEach(hwPref => {
                const row = document.createElement('tr');
                const tdLabel = document.createElement('td');
                tdLabel.className = 'codec-row-header';
                
                // Format label nicely
                const hwLabel = hwPref === 'prefer-hardware' ? 'HW' : hwPref === 'prefer-software' ? 'SW' : 'Default';
                tdLabel.textContent = `${CODECS[codecKey].name} (${hwLabel})`;
                row.appendChild(tdLabel);

                colCombos.forEach(combo => {
                    const td = document.createElement('td');
                    td.className = 'test-cell';
                    
                    // Find standard identifier we can hook into to update results later!
                    // Map to unique IDs
                    const modeStr = combo.mode ? `_${combo.mode}` : '';
                    const cellId = `wc_${codecKey}_${combo.res}${modeStr}_${hwPref}`;
                    td.id = cellId;

                    const cellInner = document.createElement('div');
                    cellInner.className = 'cell-inner cell-pending';
                    cellInner.textContent = '-';
                    
                    td.appendChild(cellInner);
                    row.appendChild(td);
                });

                tbody.appendChild(row);
            });
        });

        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        wcCard.appendChild(tableWrapper);
        elements.matrixViewContainer.appendChild(wcCard);
    }

    if (selections.apiTypes.includes('WebRTC')) {
        const wrtcCard = document.createElement('div');
        wrtcCard.className = 'matrix-table-card';
        
        const title = document.createElement('h3');
        title.className = 'matrix-card-title';
        title.textContent = 'WebRTC API local Loopback Matrix';
        wrtcCard.appendChild(title);

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'matrix-table-wrapper';

        const table = document.createElement('table');
        table.className = 'matrix-table';

        // 1. Header Row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        const thLabel = document.createElement('th');
        thLabel.textContent = 'Codec';
        headerRow.appendChild(thLabel);

        const colCombos = [];
        selections.resolutions.forEach(res => {
            const scalabilityModes = selections.scalabilityModes.length > 0 ? selections.scalabilityModes : [null];
            scalabilityModes.forEach(mode => {
                selections.transmissionModes.forEach(txMode => {
                    colCombos.push({ res, mode, txMode });
                    const th = document.createElement('th');
                    const modeLabel = mode || 'Default';
                    const txLabel = txMode === 'simulcast' ? 'Simulcast' : 'Singlecast';
                    
                    const divRes = document.createElement('div');
                    divRes.className = 'hdr-res';
                    divRes.textContent = res;
                    th.appendChild(divRes);

                    const divMode = document.createElement('div');
                    divMode.className = 'hdr-mode';
                    divMode.textContent = modeLabel;
                    th.appendChild(divMode);

                    const divTx = document.createElement('div');
                    divTx.className = 'hdr-tx';
                    divTx.textContent = `(${txLabel})`;
                    th.appendChild(divTx);

                    headerRow.appendChild(th);
                });
            });
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // 2. Body Rows
        const tbody = document.createElement('tbody');
        selections.codecs.forEach(codecKey => {
            const row = document.createElement('tr');
            const tdLabel = document.createElement('td');
            tdLabel.className = 'codec-row-header';
            tdLabel.textContent = CODECS[codecKey].name;
            row.appendChild(tdLabel);

            colCombos.forEach(combo => {
                const td = document.createElement('td');
                td.className = 'test-cell';
                
                const modeStr = combo.mode ? `_${combo.mode}` : '';
                const cellId = `wrtc_${codecKey}_${combo.res}${modeStr}_${combo.txMode}`;
                td.id = cellId;

                const cellInner = document.createElement('div');
                cellInner.className = 'cell-inner cell-pending';
                cellInner.textContent = '-';
                
                td.appendChild(cellInner);
                row.appendChild(td);
            });

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        wrtcCard.appendChild(tableWrapper);
        elements.matrixViewContainer.appendChild(wrtcCard);
    }
}

/**
 * Dispatched by engine when a specific test begins execution
 */
function handleTestStarted(test) {
    updateCellStatus(test, 'testing', '...');
    showToast(`Testing: ${test.apiType} ${test.codecKey} ${test.resKey} ${test.scalabilityMode || ''}`, 'info');
}

/**
 * Dispatched by engine when a specific test concludes
 */
function handleTestCompleted(test) {
    const existingIdx = suiteResults.findIndex(t => t.id === test.id);
    if (existingIdx !== -1) {
        suiteResults[existingIdx] = test;
    } else {
        suiteResults.push(test);
    }
    
    // 1. Update Matrix View cell
    let symbol = 'P';
    let statusClass = 'cell-passed';
    const hasDeviations = test.stats && test.stats.hasPermanentDeviations;

    if (test.status === 'passed' && hasDeviations) {
        symbol = 'W';
        statusClass = 'cell-warning';
    } else if (test.status === 'failed') {
        symbol = 'F';
        statusClass = 'cell-failed';
    } else if (test.status === 'unsupported') {
        symbol = 'U';
        statusClass = 'cell-unsupported';
    }
    updateCellStatus(test, statusClass, symbol);

    // 2. Append to List View
    appendToListGrid(test);

    // 3. Send toast notification
    if (test.status === 'passed') {
        if (hasDeviations) {
            showToast(`Passed with Deviations: ${test.apiType} ${test.codecKey} ${test.resKey}`, 'info');
        } else {
            showToast(`Passed: ${test.apiType} ${test.codecKey} ${test.resKey}`, 'passed');
        }
    } else if (test.status === 'failed') {
        showToast(`Failed: ${test.apiType} ${test.codecKey} ${test.resKey}`, 'failed');
    }
}

/**
 * Resolves specific matrix cell based on test configurations and modifies status
 */
function updateCellStatus(test, statusClass, symbol) {
    let cellId = '';
    const modeStr = test.scalabilityMode ? `_${test.scalabilityMode}` : '';
    
    if (test.apiType === 'WebCodecs') {
        cellId = `wc_${test.codecKey}_${test.resKey}${modeStr}_${test.hardwareAcceleration}`;
    } else {
        const txMode = test.isSimulcast ? 'simulcast' : 'singlecast';
        cellId = `wrtc_${test.codecKey}_${test.resKey}${modeStr}_${txMode}`;
    }

    const cell = document.getElementById(cellId);
    if (cell) {
        cell.replaceChildren();
        
        const inner = document.createElement('div');
        // Remove legacy classes
        inner.className = `cell-inner ${statusClass}`;
        inner.textContent = symbol;
        
        cell.appendChild(inner);

        // Bind dynamic detailed viewer modal trigger!
        cell.onclick = () => openDetailModal(test);
    }
}

/**
 * Dynamically constructs structural row item for list view
 */
function appendToListGrid(test) {
    let row = elements.listGrid.querySelector(`.list-item-row[data-id="${test.id}"]`);
    const isUpdate = !!row;

    if (!row) {
        row = document.createElement('div');
        row.className = 'list-item-row';
        row.dataset.id = test.id;
        row.onclick = () => openDetailModal(test);
    } else {
        row.replaceChildren(); // Wipe cells to rebuild
    }

    const colCodec = document.createElement('div');
    colCodec.className = 'list-item-codec';
    colCodec.textContent = `${test.apiType}: ${CODECS[test.codecKey].name}`;
    row.appendChild(colCodec);

    const colRes = document.createElement('div');
    colRes.className = 'list-item-val';
    colRes.textContent = test.resKey;
    row.appendChild(colRes);

    const colMode = document.createElement('div');
    colMode.className = 'list-item-val';
    const txSuffix = test.apiType === 'WebRTC' ? (test.isSimulcast ? ' (Simulcast)' : ' (Single)') : '';
    colMode.textContent = (test.scalabilityMode || 'Standard') + txSuffix;
    row.appendChild(colMode);

    const colHw = document.createElement('div');
    colHw.className = 'list-item-val';
    const hwLabel = test.hardwareAcceleration === 'prefer-hardware' ? 'HW' : test.hardwareAcceleration === 'prefer-software' ? 'SW' : 'Default';
    colHw.textContent = test.apiType === 'WebCodecs' ? hwLabel : '-';
    row.appendChild(colHw);

    const colStatus = document.createElement('div');
    const badge = document.createElement('span');
    const hasDeviations = test.stats && test.stats.hasPermanentDeviations;

    if (test.status === 'passed' && hasDeviations) {
        badge.className = 'badge badge-warning';
        badge.textContent = 'deviations';
    } else {
        badge.className = `badge badge-${test.status}`;
        badge.textContent = test.status;
    }
    colStatus.appendChild(badge);
    row.appendChild(colStatus);

    if (!isUpdate) {
        elements.listGrid.appendChild(row);
    }
}

function refreshListView() {
    const query = elements.listSearchInput.value.toLowerCase();
    const statusFilter = elements.listStatusFilter.value;

    const rows = elements.listGrid.querySelectorAll('.list-item-row');
    rows.forEach(row => {
        const test = suiteResults.find(t => t.id === row.dataset.id);
        if (!test) return;

        const matchesQuery = 
            test.codecKey.toLowerCase().includes(query) || 
            CODECS[test.codecKey].name.toLowerCase().includes(query) ||
            test.apiType.toLowerCase().includes(query) ||
            test.resKey.toLowerCase().includes(query) ||
            (test.scalabilityMode && test.scalabilityMode.toLowerCase().includes(query));

        const matchesStatus = statusFilter === 'all' || 
            (statusFilter === 'deviations' && test.status === 'passed' && test.stats && test.stats.hasPermanentDeviations) ||
            (statusFilter === 'passed' && test.status === 'passed' && (!test.stats || !test.stats.hasPermanentDeviations)) ||
            (statusFilter !== 'deviations' && statusFilter !== 'passed' && test.status === statusFilter);

        if (matchesQuery && matchesStatus) {
            row.style.display = 'grid';
        } else {
            row.style.display = 'none';
        }
    });
}

/**
 * Dispatched by engine during ongoing state shifts
 */
function handleProgressUpdate(progressData) {
    elements.statsPendingCount.textContent = progressData.stats.pending;
    elements.statsTestingCount.textContent = progressData.stats.testing;
    elements.statsPassedCount.textContent = progressData.stats.passed;
    elements.statsFailedCount.textContent = progressData.stats.failed;
    elements.statsUnsupportedCount.textContent = progressData.stats.unsupported;
}

/**
 * Concludes the active run suite pipeline
 */
function handleSuiteFinished(results) {
    elements.btnRunSuite.disabled = false;
    elements.btnCancelSuite.disabled = true;
    elements.btnExportJSON.disabled = false;
    showToast('Capability Analyzer testing suite complete.', 'passed');
}

/**
 * Opens detailed modal frame displaying active logger updates, SDP exchanges, or error dumps
 */
function openDetailModal(test) {
    elements.modalTitle.textContent = `${test.apiType} Interaction Analysis Details`;
    elements.modalCodec.textContent = CODECS[test.codecKey].name;
    elements.modalApiType.textContent = test.apiType;
    elements.modalResolution.textContent = test.resKey;
    elements.modalScalability.textContent = test.scalabilityMode || 'Standard (No temporal scaling)';
    
    if (test.apiType === 'WebCodecs') {
        const hwLabel = test.hardwareAcceleration === 'prefer-hardware' ? 'Hardware Preferred' : test.hardwareAcceleration === 'prefer-software' ? 'Software Preferred' : 'No Preference';
        elements.modalHwPref.textContent = hwLabel;
    } else {
        if (test.stats) {
            const staticHwLabel = test.stats.staticPowerEfficient ? 'Hardware (MediaCaps)' : 'Software / WebRTC Default';
            const enc = test.stats.encoderImplementation && test.stats.encoderImplementation !== 'unknown'
                ? test.stats.encoderImplementation
                : staticHwLabel;
            const dec = test.stats.decoderImplementation && test.stats.decoderImplementation !== 'unknown'
                ? test.stats.decoderImplementation
                : staticHwLabel;

            if (enc === 'Software / WebRTC Default' && dec === 'Software / WebRTC Default') {
                elements.modalHwPref.textContent = 'WebRTC Default (Software)';
            } else {
                elements.modalHwPref.textContent = `Enc: ${enc} | Dec: ${dec}`;
            }
        } else {
            elements.modalHwPref.textContent = 'WebRTC Engine Auto';
        }
    }

    // Reset dynamic sections
    elements.modalWarningBox.style.display = 'none';
    elements.modalWarningBox.replaceChildren();
    elements.modalContrastSection.style.display = 'none';
    elements.modalContrastBody.replaceChildren();

    // Populate Warning block if warnings exist
    if (test.stats && test.stats.warnings && test.stats.warnings.length > 0) {
        elements.modalWarningBox.style.display = 'block';
        test.stats.warnings.forEach(warning => {
            const p = document.createElement('p');
            p.textContent = warning;
            elements.modalWarningBox.appendChild(p);
        });
    }

    // Build Side-by-Side Contrast Table
    if (test.stats) {
        elements.modalContrastSection.style.display = 'block';

        const createStatusBadge = (isMatch, desc) => {
            const span = document.createElement('span');
            span.className = `badge ${isMatch ? 'badge-passed' : 'badge-failed'}`;
            span.textContent = desc;
            return span;
        };

        const addContrastRow = (paramName, targetVal, activeVal, isMatch, statusDesc) => {
            const tr = document.createElement('tr');
            
            const tdParam = document.createElement('td');
            tdParam.className = 'codec-row-header';
            tdParam.textContent = paramName;
            tr.appendChild(tdParam);

            const tdTarget = document.createElement('td');
            tdTarget.textContent = targetVal;
            tr.appendChild(tdTarget);

            const tdActive = document.createElement('td');
            tdActive.textContent = activeVal;
            tr.appendChild(tdActive);

            const tdStatus = document.createElement('td');
            tdStatus.appendChild(createStatusBadge(isMatch, statusDesc));
            tr.appendChild(tdStatus);

            elements.modalContrastBody.appendChild(tr);
        };

        // A. Video Codec
        addContrastRow(
            'Video Codec',
            CODECS[test.codecKey].name,
            test.stats.negotiatedCodec || CODECS[test.codecKey].name,
            true,
            'MATCH'
        );

        // B. Output Resolution
        const targetRes = `${test.stats.targetWidth || test.width}x${test.stats.targetHeight || test.height}`;
        const activeRes = test.stats.resolution || `${test.width}x${test.height}`;
        const isResMatch = !test.stats.warnings || !test.stats.warnings.some(w => w.includes('resolution'));
        const resStatusDesc = isResMatch ? 'MATCH' : 'THROTTLED';
        addContrastRow('Output Resolution', targetRes, activeRes, isResMatch, resStatusDesc);

        // C. Scalability Mode
        const targetScalability = test.stats.targetScalability || test.scalabilityMode || 'L1T1';
        const activeScalability = test.stats.activeScalability || 'unknown';
        const isScalabilityMatch = !test.stats.warnings || !test.stats.warnings.some(w => w.includes('Scalability'));
        const scalabilityStatusDesc = isScalabilityMatch ? 'MATCH' : 'BYPASSED';
        addContrastRow('Scalability Mode', targetScalability, activeScalability, isScalabilityMatch, scalabilityStatusDesc);

        // D. Negotiated Implementations
        const encImpl = test.stats.encoderImplementation || 'unknown';
        const decImpl = test.stats.decoderImplementation || 'unknown';
        addContrastRow('Active Encoder', test.apiType === 'WebCodecs' ? 'User Preferred' : 'WebRTC Auto', encImpl, true, 'INFO');
        addContrastRow('Active Decoder', test.apiType === 'WebCodecs' ? 'User Preferred' : 'WebRTC Auto', decImpl, true, 'INFO');
    }

    // Reset and Populate Resolution Timeline Visualizer
    elements.modalTimelineSection.style.display = 'none';
    elements.modalTimelineContainer.replaceChildren();

    if (test.stats && test.stats.resolutionHistory && test.stats.resolutionHistory.length > 0) {
        elements.modalTimelineSection.style.display = 'block';

        test.stats.resolutionHistory.forEach((step, idx) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'timeline-step';

            const spanTime = document.createElement('span');
            spanTime.className = 'time';
            spanTime.textContent = `${step.time}s`;
            stepDiv.appendChild(spanTime);

            const spanRes = document.createElement('span');
            spanRes.className = 'res';
            spanRes.textContent = step.res;
            stepDiv.appendChild(spanRes);

            elements.modalTimelineContainer.appendChild(stepDiv);

            if (idx < test.stats.resolutionHistory.length - 1) {
                const arrow = document.createElement('span');
                arrow.className = 'timeline-arrow';
                arrow.textContent = '➔';
                elements.modalTimelineContainer.appendChild(arrow);
            }
        });
    }

    // Status badge mapping
    elements.modalStatus.textContent = test.status;
    elements.modalStatus.className = `value badge badge-${test.status}`;

    // Populate Logs
    elements.modalLogs.replaceChildren();
    if (test.logs && test.logs.length > 0) {
        elements.modalLogs.textContent = test.logs.join('\n');
    } else {
        elements.modalLogs.textContent = 'No execution log frames emitted during test execution.';
    }

    // Parse failures
    if (test.status === 'failed' && test.error) {
        elements.modalErrorSection.style.display = 'block';
        elements.modalErrorText.textContent = test.error;
    } else {
        elements.modalErrorSection.style.display = 'none';
    }

    // Configurations payload
    const payload = {
        codec: test.codecKey,
        apiType: test.apiType,
        resolution: test.resKey,
        width: test.width,
        height: test.height,
        bitrate: test.bitrate,
        scalabilityMode: test.scalabilityMode,
        hardwareAcceleration: test.hardwareAcceleration,
        simulcast: test.isSimulcast
    };
    elements.modalPayload.textContent = JSON.stringify(payload, null, 2);

    // Configure selective retry button state
    activeModalTest = test;
    const isSuiteRunning = elements.btnRunSuite.disabled;
    const isFinishedStatus = test.status === 'passed' || test.status === 'failed' || test.status === 'unsupported';

    if (isFinishedStatus && !isSuiteRunning) {
        elements.btnModalRetry.style.display = 'inline-flex';
        elements.btnModalRetry.disabled = false;
    } else {
        elements.btnModalRetry.style.display = 'none';
    }

    elements.detailModal.classList.add('active');
}

function closeModal() {
    elements.detailModal.classList.remove('active');
}

/**
 * Spawns short-lived visual notification tags in the viewport
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const textNode = document.createElement('span');
    textNode.textContent = message;
    toast.appendChild(textNode);
    
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => {
            if (toast.parentNode === elements.toastContainer) {
                elements.toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3500);
}

/**
 * Performs structured JSON output saving
 */
function exportResultsToJSON() {
    if (suiteResults.length === 0) return;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(suiteResults, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `capabilities_report_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    
    showToast('Capabilities Report JSON downloaded.', 'passed');
}

/**
 * Runs system diagnostics to probe context security, API availability, and GPU vendor
 */
function runDiagnostics() {
    const contextBadge = document.getElementById('diagContext');
    const wcBadge = document.getElementById('diagWebCodecs');
    const rtcBadge = document.getElementById('diagWebRTC');
    const gpuDiv = document.getElementById('diagGpu');

    if (!contextBadge || !wcBadge || !rtcBadge || !gpuDiv) return;

    // 1. Secure Context Check
    if (window.isSecureContext) {
        contextBadge.textContent = 'Secure';
        contextBadge.className = 'badge badge-passed';
    } else {
        contextBadge.textContent = 'Insecure';
        contextBadge.className = 'badge badge-failed';
        showToast('Insecure Context! WebCodecs requires HTTPS or localhost/127.0.0.1.', 'failed');
    }

    // 2. WebCodecs Availability
    const wcSupported = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
    wcBadge.textContent = wcSupported ? 'Available' : 'Blocked';
    wcBadge.className = wcSupported ? 'badge badge-passed' : 'badge badge-failed';

    // 3. WebRTC Availability
    const rtcSupported = typeof RTCPeerConnection !== 'undefined';
    rtcBadge.textContent = rtcSupported ? 'Available' : 'Blocked';
    rtcBadge.className = rtcSupported ? 'badge badge-passed' : 'badge badge-failed';

    // 4. GPU Probing via WebGL
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                gpuDiv.textContent = `GPU: ${renderer}`;
            } else {
                gpuDiv.textContent = `GPU: WebGL active (info restricted)`;
            }
        } else {
            gpuDiv.textContent = `GPU: WebGL unavailable`;
        }
    } catch (e) {
        gpuDiv.textContent = `GPU: Probing failed`;
    }
}

/**
 * Serializes the current control configurations and saves them to LocalStorage
 */
function saveSelectionsToLocalStorage() {
    try {
        const selections = gatherSelections();
        const settings = {
            concurrency: elements.cfgConcurrency.value,
            timeout: elements.cfgTimeout.value
        };
        localStorage.setItem('media_capability_analyzer_cfg', JSON.stringify({ selections, settings }));
    } catch (err) {
        console.error('Failed to save configurations to LocalStorage:', err);
    }
}

/**
 * Hydrates the controls checkboxes and settings input values from LocalStorage
 */
function loadSelectionsFromLocalStorage() {
    try {
        const saved = localStorage.getItem('media_capability_analyzer_cfg');
        if (!saved) return;

        const { selections, settings } = JSON.parse(saved);
        if (!selections || !settings) return;

        // 1. Core API checks
        elements.cfgWebCodecs.checked = selections.apiTypes.includes('WebCodecs');
        elements.cfgWebRTC.checked = selections.apiTypes.includes('WebRTC');

        // 2. Codec checks
        elements.codecH265.checked = selections.codecs.includes('H265');
        elements.codecVP9.checked = selections.codecs.includes('VP9');
        elements.codecAV1.checked = selections.codecs.includes('AV1');
        elements.codecH264.checked = selections.codecs.includes('H264');
        elements.codecVP8.checked = selections.codecs.includes('VP8');

        // 3. Hardware preferences checks
        elements.hwPreferHardware.checked = selections.hardwarePrefs.includes('prefer-hardware');
        elements.hwPreferSoftware.checked = selections.hardwarePrefs.includes('prefer-software');
        elements.hwNoPreference.checked = selections.hardwarePrefs.includes('no-preference');

        // 4. Transmission modes
        if (selections.transmissionModes) {
            elements.modeSinglecast.checked = selections.transmissionModes.includes('singlecast');
            elements.modeSimulcast.checked = selections.transmissionModes.includes('simulcast');
        }

        // 5. Resolution checks
        elements.res1080p.checked = selections.resolutions.includes('1080p');
        elements.res720p.checked = selections.resolutions.includes('720p');
        elements.res360p.checked = selections.resolutions.includes('360p');
        elements.res180p.checked = selections.resolutions.includes('180p');

        // 6. Settings inputs
        elements.cfgConcurrency.value = settings.concurrency || 1;
        elements.cfgTimeout.value = settings.timeout || 10;

        // 7. Dynamic Scalability checkboxes
        if (selections.scalabilityModes) {
            const scaleChecks = elements.scalabilityContainer.querySelectorAll('input[type="checkbox"]');
            scaleChecks.forEach(input => {
                input.checked = selections.scalabilityModes.includes(input.value);
            });
        }
    } catch (err) {
        console.error('Failed to load configurations from LocalStorage:', err);
    }
}

/**
 * Resets the control sidebar configuration elements back to pristine defaults
 */
function resetToDefaultConfig() {
    try {
        localStorage.removeItem('media_capability_analyzer_cfg');

        // Reset checkboxes to default states
        elements.cfgWebCodecs.checked = true;
        elements.cfgWebRTC.checked = true;

        elements.codecH265.checked = true;
        elements.codecVP9.checked = true;
        elements.codecAV1.checked = true;
        elements.codecH264.checked = true;
        elements.codecVP8.checked = true;

        elements.hwPreferHardware.checked = true;
        elements.hwPreferSoftware.checked = true;
        elements.hwNoPreference.checked = true;

        elements.modeSinglecast.checked = true;
        elements.modeSimulcast.checked = true;

        elements.res1080p.checked = true;
        elements.res720p.checked = true;
        elements.res360p.checked = true;
        elements.res180p.checked = true;

        elements.cfgConcurrency.value = 1;
        elements.cfgTimeout.value = 10;

        // Re-populate dynamic scalability modes checklist (default check L1T1, L1T2, L1T3)
        populateScalabilityCheckboxes();

        showToast('Configurations reset to defaults.', 'info');
    } catch (err) {
        console.error('Failed to reset configurations:', err);
    }
}

let activeModalTest = null; // Stored reference for selective retries

/**
 * Executes single-test isolated retry for the currently selected modal test
 */
async function retryCurrentModalTest() {
    if (!activeModalTest) return;

    // 1. Disable retry button to prevent double taps
    elements.btnModalRetry.disabled = true;

    // 2. Close modal
    closeModal();

    // 3. Reset status cell to testing state
    updateCellStatus(activeModalTest, 'testing', '...');

    // 4. Reset list view row badge to testing state
    const listRow = elements.listGrid.querySelector(`.list-item-row[data-id="${activeModalTest.id}"]`);
    if (listRow) {
        const badge = listRow.querySelector('.badge');
        if (badge) {
            badge.className = 'badge badge-testing';
            badge.textContent = 'testing';
        }
    }

    showToast(`Retrying test for ${activeModalTest.apiType} ${activeModalTest.codecKey} ${activeModalTest.resKey}...`, 'info');

    // 5. Trigger isolated single retry on test engine
    const timeoutValue = parseFloat(elements.cfgTimeout.value) || 10;
    
    try {
        await engine.retrySingleTest(activeModalTest, timeoutValue);
    } catch (err) {
        showToast(`Retry execution failed: ${err.message}`, 'failed');
    }
}
