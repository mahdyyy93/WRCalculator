(function () {
  'use strict';

  const STORAGE_KEY = 'wr_calculator_session_v1';
  const VALID_MODES = new Set(['winRate', 'matchesWon', 'matchesPlayed']);
  const DEFAULT_STATE = {
    mode: 'winRate',
    matchesPlayed: '100',
    matchesWon: '55',
    winRate: '55',
    targetWinRate: '60',
  };

  const {
    parseNumber,
    formatPercent,
    solveWinRate,
    solveMatchesWon,
    solveMatchesPlayed,
    calculateWinsNeeded,
  } = window.WRCalculator;

  const elements = {
    modeButtons: Array.from(document.querySelectorAll('.seg-btn')),
    fieldGroups: {
      matchesPlayed: document.querySelector('[data-field="matchesPlayed"]'),
      matchesWon: document.querySelector('[data-field="matchesWon"]'),
      winRate: document.querySelector('[data-field="winRate"]'),
    },
    inputs: {
      matchesPlayed: document.getElementById('matches-played'),
      matchesWon: document.getElementById('matches-won'),
      winRate: document.getElementById('win-rate'),
      targetWinRate: document.getElementById('target-win-rate'),
    },
    calcStatus: document.getElementById('calc-status'),
    goalContext: document.getElementById('goal-context'),
    goalResult: document.getElementById('goal-result'),
    presetButtons: Array.from(document.querySelectorAll('.preset-chip')),
    addWinBtn: document.getElementById('add-win-btn'),
    addLossBtn: document.getElementById('add-loss-btn'),
    resetBtn: document.getElementById('reset-btn'),
  };

  let currentMode = DEFAULT_STATE.mode;
  let lastValidStats = null;

  function loadSessionState() {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw === null) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE };
      return {
        mode: VALID_MODES.has(parsed.mode) ? parsed.mode : DEFAULT_STATE.mode,
        matchesPlayed: typeof parsed.matchesPlayed === 'string' ? parsed.matchesPlayed : '',
        matchesWon: typeof parsed.matchesWon === 'string' ? parsed.matchesWon : '',
        winRate: typeof parsed.winRate === 'string' ? parsed.winRate : '',
        targetWinRate: typeof parsed.targetWinRate === 'string' ? parsed.targetWinRate : '',
      };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  function saveSessionState() {
    try {
      const state = {
        mode: currentMode,
        matchesPlayed: elements.inputs.matchesPlayed.value,
        matchesWon: elements.inputs.matchesWon.value,
        winRate: elements.inputs.winRate.value,
        targetWinRate: elements.inputs.targetWinRate.value,
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }

  function setMode(mode) {
    currentMode = VALID_MODES.has(mode) ? mode : 'winRate';

    elements.modeButtons.forEach((btn) => {
      const active = btn.dataset.mode === currentMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });

    Object.entries(elements.fieldGroups).forEach(([key, group]) => {
      const isOutput = key === currentMode;
      const input = elements.inputs[key];
      const tag = group.querySelector('.calc-tag');

      group.classList.toggle('is-output', isOutput);
      input.readOnly = isOutput;
      if (tag) tag.hidden = !isOutput;
    });
  }

  function renderCalcStatus(result) {
    const box = elements.calcStatus;
    box.replaceChildren();

    if (!result.ok) {
      box.className = 'status-box is-error';
      box.textContent = result.error;
      return;
    }

    box.className = 'status-box';

    const summary = document.createElement('span');
    summary.append('Losses: ');
    const lossesStrong = document.createElement('strong');
    lossesStrong.textContent = String(result.losses);
    summary.append(lossesStrong);

    if (result.mode === 'matchesWon' && !Number.isInteger(result.exactValue)) {
      summary.append(
        ` · Exact: ${result.exactValue.toFixed(2)} wins (rounded to ${result.matchesWon} = ${formatPercent(result.actualWinRate)}% WR)`
      );
    } else if (result.mode === 'matchesPlayed' && !Number.isInteger(result.exactValue)) {
      summary.append(
        ` · Exact: ${result.exactValue.toFixed(2)} matches (rounded to ${result.matchesPlayed} = ${formatPercent(result.actualWinRate)}% WR)`
      );
    } else {
      summary.append(
        ` · Record: ${result.matchesWon}W - ${result.losses}L (${formatPercent(result.winRate)}%)`
      );
    }

    box.append(summary);
  }

  function updatePresetHighlights(targetValue) {
    const num = parseNumber(targetValue);
    elements.presetButtons.forEach((btn) => {
      const btnVal = Number(btn.dataset.target);
      const isMatch = num !== null && Math.abs(num - btnVal) < 1e-9;
      btn.classList.toggle('is-active', isMatch);
    });
  }

  function createProgressBar(currentPct, targetPct) {
    const clampedCurrent = Math.max(0, Math.min(100, currentPct));
    const clampedTarget = Math.max(0, Math.min(100, targetPct));

    const wrap = document.createElement('div');
    wrap.className = 'progress-wrap';

    const labels = document.createElement('div');
    labels.className = 'progress-labels';
    const left = document.createElement('span');
    left.textContent = `Current: ${formatPercent(currentPct)}%`;
    const right = document.createElement('span');
    right.textContent = `Target: ${formatPercent(targetPct)}%`;
    labels.append(left, right);

    const track = document.createElement('div');
    track.className = 'progress-track';

    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${clampedCurrent}%`;

    const marker = document.createElement('div');
    marker.className = 'progress-target';
    marker.style.left = `calc(${clampedTarget}% - 1px)`;
    marker.title = `Target: ${formatPercent(targetPct)}%`;

    track.append(fill, marker);
    wrap.append(labels, track);
    return wrap;
  }

  function renderGoal(stats) {
    const targetInput = elements.inputs.targetWinRate.value;
    updatePresetHighlights(targetInput);

    const box = elements.goalResult;
    box.replaceChildren();

    if (!stats) {
      elements.goalContext.textContent = 'Waiting for stats';
      box.className = 'goal-result is-error';
      const p = document.createElement('p');
      p.className = 'goal-sub';
      p.textContent = 'Enter valid match stats on the left to calculate wins needed.';
      box.append(p);
      return;
    }

    const currentWr =
      stats.matchesPlayed > 0 ? (stats.matchesWon * 100) / stats.matchesPlayed : 0;
    elements.goalContext.textContent = `${stats.matchesWon}W / ${stats.matchesPlayed}M (${formatPercent(currentWr)}%)`;

    const goal = calculateWinsNeeded(stats.matchesPlayed, stats.matchesWon, targetInput);

    if (!goal.ok) {
      box.className = 'goal-result is-error';
      const p = document.createElement('p');
      p.className = 'goal-sub';
      p.textContent = goal.error;
      box.append(p);
      return;
    }

    if (!goal.possible) {
      box.className = 'goal-result is-impossible';
      const headline = document.createElement('p');
      headline.className = 'goal-headline';
      headline.textContent = 'Target unreachable';
      const sub = document.createElement('p');
      sub.className = 'goal-sub';
      sub.textContent = goal.reason;
      box.append(headline, sub, createProgressBar(goal.currentWinRate, goal.targetWinRate));
      return;
    }

    if (goal.alreadyAchieved) {
      box.className = 'goal-result is-achieved';
      const headline = document.createElement('p');
      headline.className = 'goal-headline';
      const numSpan = document.createElement('span');
      numSpan.className = 'highlight';
      numSpan.textContent = '0 wins needed';
      headline.append(numSpan, ' — Goal reached!');

      const sub = document.createElement('p');
      sub.className = 'goal-sub';
      sub.textContent = `You're already at ${formatPercent(goal.currentWinRate)}% (target: ${formatPercent(goal.targetWinRate)}%).`;
      box.append(headline, sub, createProgressBar(goal.currentWinRate, goal.targetWinRate));
      return;
    }

    box.className = 'goal-result';
    const headline = document.createElement('p');
    headline.className = 'goal-headline';
    const numSpan = document.createElement('span');
    numSpan.className = 'highlight';
    numSpan.textContent = `${goal.winsNeeded} ${goal.winsNeeded === 1 ? 'win' : 'wins'}`;
    headline.append(numSpan, ' in a row needed');

    const sub = document.createElement('p');
    sub.className = 'goal-sub';
    sub.textContent = `Reaches ${goal.projectedWins} / ${goal.projectedMatches} wins (${formatPercent(goal.projectedWinRate)}% WR) with 0 losses.`;

    box.append(headline, sub, createProgressBar(goal.currentWinRate, goal.targetWinRate));
  }

  function recalculate() {
    const playedVal = elements.inputs.matchesPlayed.value;
    const wonVal = elements.inputs.matchesWon.value;
    const rateVal = elements.inputs.winRate.value;

    let result;
    if (currentMode === 'winRate') {
      result = solveWinRate(playedVal, wonVal);
      elements.inputs.winRate.value = result.ok ? formatPercent(result.winRate) : '';
    } else if (currentMode === 'matchesWon') {
      result = solveMatchesWon(playedVal, rateVal);
      elements.inputs.matchesWon.value = result.ok ? String(result.matchesWon) : '';
    } else {
      result = solveMatchesPlayed(wonVal, rateVal);
      elements.inputs.matchesPlayed.value = result.ok ? String(result.matchesPlayed) : '';
    }

    lastValidStats = result.ok
      ? { matchesPlayed: result.matchesPlayed, matchesWon: result.matchesWon }
      : null;

    renderCalcStatus(result);
    renderGoal(lastValidStats);
    saveSessionState();
  }

  function logQuickMatch(isWin) {
    let basePlayed = 0;
    let baseWon = 0;

    if (lastValidStats) {
      basePlayed = lastValidStats.matchesPlayed;
      baseWon = lastValidStats.matchesWon;
    } else {
      const p = parseNumber(elements.inputs.matchesPlayed.value);
      const w = parseNumber(elements.inputs.matchesWon.value);
      if (p !== null && Number.isInteger(p) && p >= 0) basePlayed = p;
      if (w !== null && Number.isInteger(w) && w >= 0 && w <= basePlayed) baseWon = w;
    }

    const nextPlayed = basePlayed + 1;
    const nextWon = isWin ? baseWon + 1 : baseWon;

    setMode('winRate');
    elements.inputs.matchesPlayed.value = String(nextPlayed);
    elements.inputs.matchesWon.value = String(nextWon);
    recalculate();
  }

  function bindEvents() {
    elements.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.mode);
        recalculate();
      });
    });

    Object.values(elements.inputs).forEach((input) => {
      input.addEventListener('input', () => {
        if (input === elements.inputs.targetWinRate) {
          renderGoal(lastValidStats);
          saveSessionState();
        } else {
          recalculate();
        }
      });
    });

    elements.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        elements.inputs.targetWinRate.value = btn.dataset.target;
        renderGoal(lastValidStats);
        saveSessionState();
      });
    });

    elements.addWinBtn.addEventListener('click', () => logQuickMatch(true));
    elements.addLossBtn.addEventListener('click', () => logQuickMatch(false));

    elements.resetBtn.addEventListener('click', () => {
      elements.inputs.matchesPlayed.value = '';
      elements.inputs.matchesWon.value = '';
      elements.inputs.winRate.value = '';
      elements.inputs.targetWinRate.value = '';
      setMode('winRate');
      recalculate();
    });
  }

  function init() {
    const saved = loadSessionState();
    elements.inputs.matchesPlayed.value = saved.matchesPlayed;
    elements.inputs.matchesWon.value = saved.matchesWon;
    elements.inputs.winRate.value = saved.winRate;
    elements.inputs.targetWinRate.value = saved.targetWinRate;

    setMode(saved.mode);
    bindEvents();
    recalculate();
  }

  init();
})();
