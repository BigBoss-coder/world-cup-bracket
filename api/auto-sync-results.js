export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Use POST." });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const footballApiKey = process.env.FOOTBALL_API_KEY;
  const footballApiHost = process.env.FOOTBALL_API_HOST || "v3.football.api-sports.io";

  if (!supabaseUrl || !serviceRoleKey || !footballApiKey) {
    response.status(400).json({ error: "Auto-sync environment variables are not configured yet." });
    return;
  }

  const { adminToken } = await request.json();
  if (!adminToken) {
    response.status(401).json({ error: "Admin code required." });
    return;
  }

  const pool = await supabaseFetch(supabaseUrl, serviceRoleKey, "/rest/v1/pools?slug=eq.world-cup-bracket&select=id,admin_token");
  if (!pool[0] || pool[0].admin_token !== adminToken) {
    response.status(401).json({ error: "Invalid admin code." });
    return;
  }

  const matches = await supabaseFetch(
    supabaseUrl,
    serviceRoleKey,
    `/rest/v1/matches?pool_id=eq.${pool[0].id}&external_id=not.is.null&select=id,external_id`,
  );

  const updates = [];
  for (const match of matches) {
    const fixture = await footballFetch(footballApiHost, footballApiKey, match.external_id);
    const winner = winnerFromFixture(fixture);
    if (!winner) continue;

    await supabaseFetch(supabaseUrl, serviceRoleKey, `/rest/v1/matches?id=eq.${match.id}`, {
      method: "PATCH",
      body: JSON.stringify({ winner }),
      headers: { Prefer: "return=minimal" },
    });
    updates.push({ matchId: match.id, winner });
  }

  response.status(200).json({ updated: updates.length, updates });
}

async function supabaseFetch(baseUrl, key, path, options = {}) {
  const result = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body,
  });

  if (!result.ok) {
    throw new Error(await result.text());
  }

  if (result.status === 204) return null;
  return result.json();
}

async function footballFetch(host, key, fixtureId) {
  const result = await fetch(`https://${host}/fixtures?id=${fixtureId}`, {
    headers: {
      "x-rapidapi-host": host,
      "x-rapidapi-key": key,
    },
  });

  if (!result.ok) {
    throw new Error(await result.text());
  }

  const body = await result.json();
  return body.response?.[0];
}

function winnerFromFixture(fixture) {
  if (!fixture || fixture.fixture?.status?.short !== "FT") return null;
  if (fixture.teams?.home?.winner) return fixture.teams.home.name;
  if (fixture.teams?.away?.winner) return fixture.teams.away.name;
  return null;
}
