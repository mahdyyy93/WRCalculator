(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WRCalculator = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Parses a numeric input value into a finite number or null if empty/invalid.
   */
  function parseNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const trimmed = String(value).trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Formats a percentage with up to 2 decimal places, trimming trailing zeros.
   */
  function formatPercent(value) {
    if (!Number.isFinite(value)) return '0';
    return Number(value.toFixed(2)).toString();
  }

  /**
   * Solves for Win Rate (%) given Matches Played and Matches Won.
   */
  function solveWinRate(matchesPlayedInput, matchesWonInput) {
    const matchesPlayed = parseNumber(matchesPlayedInput);
    const matchesWon = parseNumber(matchesWonInput);

    if (matchesPlayed === null || matchesWon === null) {
      return { ok: false, error: 'Enter both matches played and won matches.' };
    }
    if (!Number.isInteger(matchesPlayed) || !Number.isInteger(matchesWon)) {
      return { ok: false, error: 'Matches must be whole numbers.' };
    }
    if (matchesPlayed < 1) {
      return { ok: false, error: 'Matches played must be at least 1.' };
    }
    if (matchesWon < 0) {
      return { ok: false, error: 'Won matches cannot be negative.' };
    }
    if (matchesWon > matchesPlayed) {
      return { ok: false, error: 'Won matches cannot exceed matches played.' };
    }

    const winRate = (matchesWon * 100) / matchesPlayed;
    const losses = matchesPlayed - matchesWon;

    return {
      ok: true,
      mode: 'winRate',
      matchesPlayed,
      matchesWon,
      losses,
      winRate,
      exactValue: winRate,
    };
  }

  /**
   * Solves for Matches Won given Matches Played and Win Rate (%).
   */
  function solveMatchesWon(matchesPlayedInput, winRateInput) {
    const matchesPlayed = parseNumber(matchesPlayedInput);
    const winRate = parseNumber(winRateInput);

    if (matchesPlayed === null || winRate === null) {
      return { ok: false, error: 'Enter both matches played and win rate.' };
    }
    if (!Number.isInteger(matchesPlayed)) {
      return { ok: false, error: 'Matches played must be a whole number.' };
    }
    if (matchesPlayed < 1) {
      return { ok: false, error: 'Matches played must be at least 1.' };
    }
    if (winRate < 0 || winRate > 100) {
      return { ok: false, error: 'Win rate must be between 0% and 100%.' };
    }

    const exactWon = (matchesPlayed * winRate) / 100;
    const matchesWon = Math.min(matchesPlayed, Math.max(0, Math.round(exactWon)));
    const actualWinRate = (matchesWon * 100) / matchesPlayed;
    const losses = matchesPlayed - matchesWon;

    return {
      ok: true,
      mode: 'matchesWon',
      matchesPlayed,
      matchesWon,
      losses,
      winRate,
      actualWinRate,
      exactValue: exactWon,
    };
  }

  /**
   * Solves for Matches Played given Matches Won and Win Rate (%).
   */
  function solveMatchesPlayed(matchesWonInput, winRateInput) {
    const matchesWon = parseNumber(matchesWonInput);
    const winRate = parseNumber(winRateInput);

    if (matchesWon === null || winRate === null) {
      return { ok: false, error: 'Enter both won matches and win rate.' };
    }
    if (!Number.isInteger(matchesWon)) {
      return { ok: false, error: 'Won matches must be a whole number.' };
    }
    if (matchesWon < 0) {
      return { ok: false, error: 'Won matches cannot be negative.' };
    }
    if (winRate < 0 || winRate > 100) {
      return { ok: false, error: 'Win rate must be between 0% and 100%.' };
    }
    if (winRate === 0) {
      return {
        ok: false,
        error:
          matchesWon > 0
            ? 'Win rate must be above 0% when you have won matches.'
            : 'Enter a win rate above 0% and at least 1 won match.',
      };
    }
    if (matchesWon === 0) {
      return {
        ok: false,
        error: 'With 0 won matches, enter at least 1 win to calculate total matches.',
      };
    }

    const exactPlayed = (matchesWon * 100) / winRate;
    const matchesPlayed = Math.max(matchesWon, Math.round(exactPlayed));
    const actualWinRate = (matchesWon * 100) / matchesPlayed;
    const losses = matchesPlayed - matchesWon;

    return {
      ok: true,
      mode: 'matchesPlayed',
      matchesPlayed,
      matchesWon,
      losses,
      winRate,
      actualWinRate,
      exactValue: exactPlayed,
    };
  }

  /**
   * Calculates consecutive wins needed (assuming 0 losses) to reach targetWinRate (%).
   */
  function calculateWinsNeeded(matchesPlayedInput, matchesWonInput, targetWinRateInput) {
    const matchesPlayed = parseNumber(matchesPlayedInput);
    const matchesWon = parseNumber(matchesWonInput);
    const targetWinRate = parseNumber(targetWinRateInput);

    if (matchesPlayed === null || matchesWon === null) {
      return { ok: false, error: 'Enter valid match stats above first.' };
    }
    if (targetWinRate === null) {
      return { ok: false, error: 'Enter a target win rate.' };
    }
    if (!Number.isInteger(matchesPlayed) || !Number.isInteger(matchesWon)) {
      return { ok: false, error: 'Matches must be whole numbers.' };
    }
    if (matchesPlayed < 0 || matchesWon < 0 || matchesWon > matchesPlayed) {
      return { ok: false, error: 'Check your matches played and won matches.' };
    }
    if (targetWinRate <= 0 || targetWinRate > 100) {
      return { ok: false, error: 'Target win rate must be between 0% and 100%.' };
    }

    if (matchesPlayed === 0) {
      return {
        ok: true,
        possible: true,
        alreadyAchieved: false,
        winsNeeded: 1,
        currentWinRate: 0,
        targetWinRate,
        projectedMatches: 1,
        projectedWins: 1,
        projectedWinRate: 100,
      };
    }

    const currentWinRate = (matchesWon * 100) / matchesPlayed;

    if (matchesWon * 100 >= targetWinRate * matchesPlayed - 1e-9) {
      return {
        ok: true,
        possible: true,
        alreadyAchieved: true,
        winsNeeded: 0,
        currentWinRate,
        targetWinRate,
        projectedMatches: matchesPlayed,
        projectedWins: matchesWon,
        projectedWinRate: currentWinRate,
      };
    }

    if (targetWinRate === 100 && matchesWon < matchesPlayed) {
      return {
        ok: true,
        possible: false,
        alreadyAchieved: false,
        winsNeeded: Infinity,
        currentWinRate,
        targetWinRate,
        reason: "100% win rate isn't reachable once you have a loss.",
      };
    }

    const raw =
      (targetWinRate * matchesPlayed - 100 * matchesWon) / (100 - targetWinRate);
    let winsNeeded = Math.max(1, Math.ceil(raw - 1e-12));

    while (
      (matchesWon + winsNeeded) * 100 <
      targetWinRate * (matchesPlayed + winsNeeded) - 1e-9
    ) {
      winsNeeded += 1;
    }

    const projectedMatches = matchesPlayed + winsNeeded;
    const projectedWins = matchesWon + winsNeeded;
    const projectedWinRate = (projectedWins * 100) / projectedMatches;

    return {
      ok: true,
      possible: true,
      alreadyAchieved: false,
      winsNeeded,
      currentWinRate,
      targetWinRate,
      projectedMatches,
      projectedWins,
      projectedWinRate,
    };
  }

  return {
    parseNumber,
    formatPercent,
    solveWinRate,
    solveMatchesWon,
    solveMatchesPlayed,
    calculateWinsNeeded,
  };
});
