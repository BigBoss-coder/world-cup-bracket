    if (selectedPick?.picked_winner === team) button.classList.add("is-picked");
    if (match.winner === team) button.classList.add("is-correct");
    button.addEventListener("click", () => savePick(match, team));
    buttons.appendChild(button);
  });

  return card;
}

function renderLeaderboard() {
  const scores = state.players
    .map((player) => {
      const picks = state.allPicks.filter((pick) => pick.player_id === player.id);
      const score = state.matches.reduce((total, match) => {
        const pick = picks.find((item) => item.match_id === match.id);
        return total + pointsFor(match, pick);
      }, 0);
      return { ...player, score };
    })
    .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name));

  els.leaderboard.innerHTML = scores
    .map(
      (player, index) => `
        <div class="player-row">
          <span class="rank">${index + 1}</span>
          <strong>${player.display_name}${player.submitted_at ? " · locked" : ""}</strong>
          <span class="score">${player.score}</span>
        </div>
      `,
    )
    .join("");
}

function renderResults() {
  els.resultsGrid.innerHTML = "";
  const adminUnlocked = els.adminToken.value.trim().length > 0;
  els.adminStatus.textContent = adminUnlocked
    ? "Results controls are visible. Saves are still checked by the database admin code."
    : "Enter the admin code to update winners.";

  state.matches.forEach((match) => {
    const row = document.createElement("div");
    row.className = "result-row";
    const teams = actualTeamsForMatch(match);
    const isWaiting = teams.some((team) => team.startsWith("Enter ") || team.startsWith("Winner of"));
    row.classList.toggle("is-waiting", isWaiting);

    const select = document.createElement("select");
    ["", ...teams].forEach((team) => {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team || "No winner yet";
      option.selected = match.winner === team;
      select.appendChild(option);
    });
    select.disabled = !adminUnlocked || isWaiting;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Save";
    button.disabled = !adminUnlocked || isWaiting;
    button.addEventListener("click", () => saveWinner(match.id, select.value || null));

    row.innerHTML = `<strong>${match.round_name} ${match.slot}</strong>`;
    row.appendChild(select);
    row.appendChild(button);
    els.resultsGrid.appendChild(row);
  });
}

function displayTeamsForMatch(match) {
  if (match.round_index === 0) return [teamLabel(match, "a"), teamLabel(match, "b")];
  return feederMatches(match).map((feeder) => {
    const pick = feeder ? pickFor(feeder.id) : null;
    return pick?.picked_winner || feeder?.winner || pickFeederLabel(feeder);
  });
}

function actualTeamsForMatch(match) {
  if (match.team_a || match.team_b || match.round_index === 0) {
    return [teamLabel(match, "a"), teamLabel(match, "b")];
  }

  return feederMatches(match).map((feeder) => feeder?.winner || resultFeederLabel(feeder));
}

function feederMatches(match) {
  const previousRound = match.round_index - 1;
  const firstSlot = (match.slot - 1) * 2 + 1;
  return [
    state.matches.find((item) => item.round_index === previousRound && item.slot === firstSlot),
    state.matches.find((item) => item.round_index === previousRound && item.slot === firstSlot + 1),
  ];
}

function feederLabel(match) {
  return match ? `Winner of ${match.round_name} ${match.slot}` : "TBD";
}

function pickFeederLabel(match) {
  return match ? `Pick ${match.round_name} ${match.slot}` : "TBD";
}

function resultFeederLabel(match) {
  return match ? `Enter ${match.round_name} ${match.slot} result` : "TBD";
}

els.joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await joinPool(els.displayName.value.trim());
  } catch (error) {
    els.saveState.textContent = error.message;
  }
});

els.copyLink.addEventListener("click", async () => {
  await navigator.clipboard.writeText(window.location.href);
  els.copyLink.textContent = "Copied";
  setTimeout(() => {
    els.copyLink.textContent = "Copy my bracket link";
  }, 1300);
});

els.copyInvite.addEventListener("click", async () => {
  await navigator.clipboard.writeText(inviteUrl());
  els.copyInvite.textContent = "Copied";
  setTimeout(() => {
    els.copyInvite.textContent = "Copy invite link";
  }, 1300);
});

els.submitBracket.addEventListener("click", submitBracket);

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    els.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-visible"));
    document.querySelector(`#${tab.dataset.view}View`).classList.add("is-visible");
  });
});

els.syncResults.addEventListener("click", async () => {
  if (!db) return alert("Add Supabase keys before syncing.");
  const response = await fetch("/api/auto-sync-results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminToken: els.adminToken.value.trim() }),
  });
  const body = await response.json();
  if (!response.ok) return alert(body.error || "Sync failed.");
  await loadData();
  render();
});

els.adminToken.addEventListener("input", renderResults);

init().catch((error) => {
  console.error(error);
  els.saveState.textContent = error.message;
});

