const CONFIG = {
  supabaseUrl: "https://jtsvjhfyojwichbvzbeb.supabase.co/rest/v1/",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0c3ZqaGZ5b2p3aWNoYnZ6YmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDIzMDksImV4cCI6MjA5ODIxODMwOX0.UwrwAySx-NvERuaoGWRoglNWBvbh7UB7_eYsSlvm33o",
  poolSlug: "world-cup-bracket",
};

const ROUND_POINTS = {
  "Round of 32": 1,
  "Round of 16": 2,
  Quarterfinals: 4,
  Semifinals: 8,
  Final: 16,
};

const ROUND_ORDER = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"];

const ROUND_OF_32_FIXTURES = [
  ["South Africa", "🇿🇦", "Canada", "🇨🇦", "2026-06-28T15:00:00-04:00"],
  ["Brazil", "🇧🇷", "Japan", "🇯🇵", "2026-06-29T13:00:00-04:00"],
  ["Germany", "🇩🇪", "Paraguay", "🇵🇾", "2026-06-29T16:30:00-04:00"],
  ["Netherlands", "🇳🇱", "Morocco", "🇲🇦", "2026-06-29T21:00:00-04:00"],
  ["Ivory Coast", "🇨🇮", "Norway", "🇳🇴", "2026-06-30T13:00:00-04:00"],
  ["France", "🇫🇷", "Sweden", "🇸🇪", "2026-06-30T17:00:00-04:00"],
  ["Mexico", "🇲🇽", "Ecuador", "🇪🇨", "2026-06-30T21:00:00-04:00"],
  ["England", "🏴", "DR Congo", "🇨🇩", "2026-07-01T12:00:00-04:00"],
  ["Belgium", "🇧🇪", "Senegal", "🇸🇳", "2026-07-01T16:00:00-04:00"],
  ["United States", "🇺🇸", "Bosnia and Herzegovina", "🇧🇦", "2026-07-01T20:00:00-04:00"],
  ["Spain", "🇪🇸", "Austria", "🇦🇹", "2026-07-02T15:00:00-04:00"],
  ["Portugal", "🇵🇹", "Croatia", "🇭🇷", "2026-07-02T19:00:00-04:00"],
  ["Switzerland", "🇨🇭", "Algeria", "🇩🇿", "2026-07-02T23:00:00-04:00"],
  ["Australia", "🇦🇺", "Egypt", "🇪🇬", "2026-07-03T14:00:00-04:00"],
  ["Argentina", "🇦🇷", "Cabo Verde", "🇨🇻", "2026-07-03T18:00:00-04:00"],
  ["Colombia", "🇨🇴", "Ghana", "🇬🇭", "2026-07-03T21:30:00-04:00"],
];

let db = null;
let state = {
  pool: null,
  player: null,
  matches: [],
  picks: [],
  allPicks: [],
  players: [],
};

const els = {
  setup: document.querySelector("#setup"),
  joinForm: document.querySelector("#joinForm"),
  displayName: document.querySelector("#displayName"),
  playerName: document.querySelector("#playerName"),
  lockState: document.querySelector("#lockState"),
  copyInvite: document.querySelector("#copyInvite"),
  copyLink: document.querySelector("#copyLink"),
  submitBracket: document.querySelector("#submitBracket"),
  bracket: document.querySelector("#bracket"),
  leaderboard: document.querySelector("#leaderboard"),
  resultsGrid: document.querySelector("#resultsGrid"),
  saveState: document.querySelector("#saveState"),
  tabs: document.querySelectorAll(".tab"),
  adminForm: document.querySelector("#adminForm"),
  adminToken: document.querySelector("#adminToken"),
  syncResults: document.querySelector("#syncResults"),
  adminStatus: document.querySelector("#adminStatus"),
};

function hasSupabaseConfig() {
  return !CONFIG.supabaseUrl.includes("PASTE_") && !CONFIG.supabaseAnonKey.includes("PASTE_");
}

function getEditToken() {
  return new URLSearchParams(window.location.search).get("player");
}

function setUrlToken(editToken) {
  const url = new URL(window.location.href);
  url.searchParams.set("player", editToken);
  window.history.replaceState({}, "", url);
}

function inviteUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("player");
  return url.toString();
}

function makeToken() {
  return crypto.getRandomValues(new Uint32Array(4)).join("-");
}

function formatKickoff(value) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function isLocked(match) {
  return match.starts_at && new Date(match.starts_at).getTime() <= Date.now();
}

function teamLabel(match, side) {
  return side === "a" ? match.team_a || "TBD" : match.team_b || "TBD";
}

function pickFor(matchId) {
  return state.picks.find((pick) => pick.match_id === matchId);
}

function bracketSubmitted() {
  return Boolean(state.player?.submitted_at);
}

function bracketComplete() {
  return state.matches.every((match) => {
    const teams = displayTeamsForMatch(match);
    const pick = pickFor(match.id);
    return pick && teams.includes(pick.picked_winner) && !teams.some(isPlaceholderTeam);
  });
}

function isPlaceholderTeam(team) {
  return team === "TBD" || team.startsWith("Pick ") || team.startsWith("Winner of") || team.startsWith("Enter ");
}

function pointsFor(match, pick) {
  if (!match.winner || !pick || pick.picked_winner !== match.winner) return 0;
  return ROUND_POINTS[match.round_name] || 0;
}

async function init() {
  if (!hasSupabaseConfig()) {
    els.saveState.textContent = "Demo mode: add your Supabase keys in app.js before sharing.";
    loadDemoData();
    render();
    return;
  }

  db = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  await loadPool();
  await loadPlayer();
  await loadData();
  render();
}

async function loadPool() {
  const { data, error } = await db
    .from("pools")
    .select("id,name,slug,created_at")
    .eq("slug", CONFIG.poolSlug)
    .single();

  if (error) throw error;
  state.pool = data;
}

async function loadPlayer() {
  const editToken = getEditToken();
  if (!editToken) return;

  const { data, error } = await db.rpc("get_player_by_token", {
    p_pool_id: state.pool.id,
    p_edit_token: editToken,
  });

  if (error) throw error;
  state.player = data?.[0] || null;
}

async function loadData() {
  const [matches, players, picks] = await Promise.all([
    db.from("matches").select("*").eq("pool_id", state.pool.id).order("round_index").order("slot"),
    db.from("public_players").select("*").eq("pool_id", state.pool.id).order("display_name"),
    db.from("picks").select("*"),
  ]);

  if (matches.error) throw matches.error;
  if (players.error) throw players.error;
  if (picks.error) throw picks.error;

  state.matches = matches.data;
  state.players = players.data;
  state.allPicks = picks.data || [];
  state.picks = state.player ? state.allPicks.filter((pick) => pick.player_id === state.player.id) : [];
}

function loadDemoData() {
  state.pool = { id: "demo", name: "World Cup Bracket" };
  state.matches = Array.from({ length: 31 }, (_, index) => {
    const roundIndex = index < 16 ? 0 : index < 24 ? 1 : index < 28 ? 2 : index < 30 ? 3 : 4;
    const slot = index - [0, 16, 24, 28, 30][roundIndex] + 1;
    const fixture = ROUND_OF_32_FIXTURES[index];
    return {
      id: `demo-${index + 1}`,
      pool_id: "demo",
      round_name: ROUND_ORDER[roundIndex],
      round_index: roundIndex,
      slot,
      team_a: fixture ? `${fixture[1]} ${fixture[0]}` : null,
      team_b: fixture ? `${fixture[3]} ${fixture[2]}` : null,
      starts_at: fixture ? fixture[4] : null,
      winner: null,
    };
  });
  state.players = [
    { id: "one", display_name: "Alex" },
    { id: "two", display_name: "Sam" },
  ];
  state.allPicks = [];
}

async function joinPool(displayName) {
  const editToken = makeToken();
  if (!db) {
    state.player = { id: "demo-player", display_name: displayName, edit_token: editToken, submitted_at: null };
    state.players.push({ id: state.player.id, pool_id: state.pool.id, display_name: displayName, submitted_at: null });
    setUrlToken(editToken);
    render();
    return;
  }

  const { data, error } = await db
    .from("players")
    .insert({
      pool_id: state.pool.id,
      display_name: displayName,
      edit_token: editToken,
    })
    .select("*")
    .single();

  if (error) throw error;
  state.player = data;
  setUrlToken(editToken);
  await loadData();
  render();
}

async function savePick(match, winner) {
  if (!state.player) {
    els.saveState.textContent = "Join the pool before saving picks.";
    return;
  }

  if (isLocked(match)) {
    els.saveState.textContent = "That match has already locked.";
    return;
  }

  if (bracketSubmitted()) {
    els.saveState.textContent = "Your bracket is submitted and locked.";
    return;
  }

  if (!db) {
    const existing = pickFor(match.id);
    if (existing) existing.picked_winner = winner;
    else {
      const pick = { id: makeToken(), player_id: state.player.id, match_id: match.id, picked_winner: winner };
      state.picks.push(pick);
      state.allPicks.push(pick);
    }
    els.saveState.textContent = `Saved ${winner}.`;
    render();
    return;
  }

  const { error } = await db.rpc("save_pick", {
    p_edit_token: state.player.edit_token,
    p_match_id: match.id,
    p_picked_winner: winner,
  });

  if (error) throw error;
  await loadData();
  render();
}

async function submitBracket() {
  if (!state.player) {
    els.saveState.textContent = "Join the pool before submitting.";
    return;
  }

  if (!bracketComplete()) {
    els.saveState.textContent = "Pick every matchup before submitting.";
    return;
  }

  if (!window.confirm("Submit and lock your bracket? You will not be able to change picks after this.")) {
    return;
  }

  if (!db) {
    state.player.submitted_at = new Date().toISOString();
    state.players = state.players.map((player) =>
      player.id === state.player.id ? { ...player, submitted_at: state.player.submitted_at } : player,
    );
    render();
    return;
  }

  const { error } = await db.rpc("submit_bracket", {
    p_edit_token: state.player.edit_token,
  });

  if (error) {
    els.saveState.textContent = error.message;
    return;
  }

  await loadPlayer();
  await loadData();
  render();
}

async function saveWinner(matchId, winner) {
  const adminToken = els.adminToken.value.trim();
  if (!adminToken) return;

  if (!db) {
    const match = state.matches.find((item) => item.id === matchId);
    if (match) match.winner = winner;
    render();
    return;
  }

  const { error } = await db.rpc("set_match_winner", {
    p_match_id: matchId,
    p_winner: winner,
    p_admin_token: adminToken,
  });

  if (error) {
    alert(error.message);
    return;
  }

  await loadData();
  render();
}

function render() {
  els.setup.style.display = state.player ? "none" : "";
  els.playerName.textContent = state.player ? state.player.display_name : "Not joined yet";
  els.lockState.textContent = bracketSubmitted() ? "Bracket submitted and locked" : "Submit once, then no edits";
  els.copyLink.disabled = !state.player;
  els.submitBracket.disabled = !state.player || bracketSubmitted() || !bracketComplete();
  els.submitBracket.textContent = bracketSubmitted() ? "Bracket locked" : "Submit bracket";
  if (bracketSubmitted()) {
    els.saveState.textContent = `Submitted ${formatKickoff(state.player.submitted_at)}. Your picks are locked.`;
  }
  renderBracket();
  renderLeaderboard();
  renderResults();
}

function renderBracket() {
  els.bracket.innerHTML = "";

  ROUND_ORDER.forEach((roundName) => {
    const col = document.createElement("div");
    col.className = "round-column";
    col.innerHTML = `<h2 class="round-title">${roundName}</h2>`;

    state.matches
      .filter((match) => match.round_name === roundName)
      .forEach((match) => col.appendChild(renderMatch(match)));

    els.bracket.appendChild(col);
  });
}

function renderMatch(match) {
  const template = document.querySelector("#matchTemplate").content.cloneNode(true);
  const card = template.querySelector(".match-card");
  const selectedPick = pickFor(match.id);
  const locked = isLocked(match);
  const submitted = bracketSubmitted();
  const teams = displayTeamsForMatch(match);
  const needsFeeders = teams.some(isPlaceholderTeam);

  template.querySelector(".round").textContent = `Match ${match.slot}`;
  template.querySelector(".kickoff").textContent = formatKickoff(match.starts_at);
  template.querySelector("h3").textContent = `${teams[0]} vs ${teams[1]}`;
  template.querySelector(".match-state").textContent = match.winner
    ? `Winner: ${match.winner}`
    : submitted
      ? "Submitted"
    : needsFeeders
      ? "Choose prior matchups first"
    : locked
      ? "Locked"
      : "Open";

  const buttons = template.querySelector(".pick-buttons");
  teams.forEach((team) => {
    const button = document.createElement("button");
    button.className = "pick";
    button.type = "button";
    button.textContent = team;
    button.disabled = submitted || locked || isPlaceholderTeam(team);
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
  await joinPool(els.displayName.value.trim());
});

els.copyLink.addEventListener("click", async () => {
  await navigator.clipboard.writeText(window.location.href);
  els.copyLink.textContent = "Copied";
  setTimeout(() => {
    els.copyLink.textContent = "Copy my edit link";
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
