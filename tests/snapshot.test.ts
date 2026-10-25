import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSnapshot, cacheSeconds, finishedRaceSessions, latestStartedSession, type RawSeason } from "../src/lib/snapshot.ts";

// Recorded from api.openf1.org on 2026-10-12, the morning after the Singapore GP.
const raw: RawSeason = JSON.parse(
  readFileSync(new URL("./fixtures/openf1-2026-singapore.json", import.meta.url), "utf8"),
);
const NOW = new Date("2026-10-12T08:00:00Z");

function build() {
  const snapshot = buildSnapshot(raw, NOW);
  assert.ok(snapshot, "fixture is a ready season");
  return snapshot;
}

describe("driver standings", () => {
  it("come from the championship table, ordered by position", () => {
    const { drivers } = build();
    assert.deepEqual(
      drivers.slice(0, 4).map((d) => [d.code, d.points, d.position]),
      [["ANT", 340, 1], ["RUS", 238, 2], ["HAM", 229, 3], ["VER", 221, 4]],
    );
  });

  it("are identified by lowercased acronym and carry the team and photo route", () => {
    const ver = build().drivers.find((d) => d.code === "VER");
    assert.equal(ver?.driverId, "ver");
    assert.equal(ver?.name, "Max Verstappen");
    assert.equal(ver?.teamId, "red_bull_racing");
    assert.equal(ver?.teamName, "Red Bull Racing");
    assert.equal(ver?.colour, "#4781D7");
    // The photo path is F1's own CDN path, so the photo route needs no OpenF1 lookup.
    assert.equal(ver?.photo, "/drivers/M/MAXVER01_Max_Verstappen/maxver01.png");
  });

  it("have no photo when OpenF1 has none or it is not on F1's CDN", () => {
    const drivers = build().drivers;
    assert.equal(drivers.find((d) => d.code === "TSU")?.photo, null); // departed, no headshot_url
    const odd: RawSeason = {
      ...raw,
      drivers: raw.drivers.map((d) => (d.name_acronym === "VER" ? { ...d, headshot_url: "https://example.com/ver.png" } : d)),
    };
    assert.equal(buildSnapshot(odd, NOW)!.drivers.find((d) => d.code === "VER")?.photo, null);
  });

  it("keep a departed driver in the standings with their last known team, flagged", () => {
    const { drivers } = build();
    assert.equal(drivers.length, 23);
    const tsu = drivers.find((d) => d.code === "TSU");
    assert.deepEqual(
      [tsu?.points, tsu?.position, tsu?.teamName, tsu?.departed],
      [1, 20, "Racing Bulls", true],
    );
    assert.equal(drivers.filter((d) => d.departed).length, 1);
  });
});

describe("wins", () => {
  it("count Grand Prix victories only, not sprints or other sessions", () => {
    const wins = Object.fromEntries(build().drivers.filter((d) => d.wins > 0).map((d) => [d.code, d.wins]));
    assert.deepEqual(wins, { ANT: 8, RUS: 3, HAM: 1, LEC: 1, NOR: 2, VER: 2 });
  });
});

describe("constructor standings", () => {
  it("come from the championship table with the team colour and summed driver wins", () => {
    const { teams } = build();
    assert.deepEqual(
      teams.slice(0, 3).map((t) => [t.teamId, t.name, t.points, t.position, t.colour, t.wins]),
      [
        ["mercedes", "Mercedes", 578, 1, "#00D7B6", 11],
        ["ferrari", "Ferrari", 444, 2, "#ED1131", 2],
        ["mclaren", "McLaren", 339, 3, "#F47600", 2],
      ],
    );
  });

  it("slugify multi-word team names and keep teams without points", () => {
    const { teams } = build();
    assert.ok(teams.find((t) => t.teamId === "haas_f1_team"));
    assert.equal(teams.find((t) => t.name === "Cadillac")?.points, 0);
  });
});

describe("rounds", () => {
  it("are the real Grand Prix weekends: no testing, and cancelled weekends take no round number", () => {
    const { rounds } = build();
    assert.equal(rounds.length, 23);
    assert.deepEqual(
      rounds.filter((r) => [1, 15, 16, 17, 18, 23].includes(r.round)).map((r) => [r.round, r.name, r.date]),
      [
        [1, "Australian Grand Prix", "2026-03-08"],
        [15, "Azerbaijan Grand Prix", "2026-09-26"],
        [16, "Bahrain Grand Prix", "2026-10-04"], // the replacement round; the two cancelled ones are gone
        [17, "Singapore Grand Prix", "2026-10-11"],
        [18, "United States Grand Prix", "2026-10-25"],
        [23, "Abu Dhabi Grand Prix", "2026-12-06"],
      ],
    );
  });

  it("stay numbered without gaps when a meeting has no Race session yet", () => {
    const noRace: RawSeason = { ...raw, sessions: raw.sessions.filter((s) => s.meeting_key !== 1294) }; // Spanish GP
    const rounds = buildSnapshot(noRace, NOW)!.rounds;
    assert.equal(rounds.length, 22);
    assert.deepEqual(rounds.map((r) => r.round), Array.from({ length: 22 }, (_, i) => i + 1));
  });

  it("are identified by a readable slug of the meeting name and year", () => {
    assert.equal(build().rounds[16]?.raceId, "singapore-grand-prix-2026");
  });

  it("flag the sprint weekends from the session list, including future ones", () => {
    const sprints = build().rounds.filter((r) => r.sprint).map((r) => r.round);
    assert.deepEqual(sprints, [2, 4, 5, 9, 12, 17]);
  });

  it("count as played only up to the race the standings include", () => {
    const { rounds } = build();
    assert.equal(rounds.filter((r) => r.played).length, 17);
    assert.equal(rounds[16]?.played, true);
    assert.equal(rounds[17]?.played, false);
  });

  it("keep a finished race remaining while its points are not in the standings yet", () => {
    // Standings still read from the Spanish GP (round 14) although Azerbaijan, Bahrain and
    // Singapore have been run: those must stay selectable rounds, not be double-counted.
    const behind: RawSeason = { ...raw, championshipSessionKey: 11369 };
    const rounds = buildSnapshot(behind, NOW)!.rounds;
    assert.deepEqual(rounds.filter((r) => r.played).map((r) => r.round).at(-1), 14);
    assert.equal(rounds.filter((r) => !r.played).length, 9);
  });
});

describe("before the first race", () => {
  const preseason: RawSeason = {
    ...raw,
    championshipSessionKey: null,
    championshipDrivers: [],
    championshipTeams: [],
    departedDrivers: [],
    raceWinners: [],
  };

  it("lists the grid on zero points, in grid order", () => {
    const snapshot = buildSnapshot(preseason, NOW)!;
    assert.equal(snapshot.drivers.length, 22);
    assert.ok(snapshot.drivers.every((d) => d.points === 0 && d.wins === 0 && !d.departed));
    assert.deepEqual(snapshot.drivers.map((d) => d.position), snapshot.drivers.map((_, i) => i + 1));
    assert.ok(snapshot.teams.length >= 10 && snapshot.teams.every((t) => t.points === 0));
    assert.ok(snapshot.rounds.every((r) => !r.played));
  });

  it("is not a season yet while OpenF1 has no drivers or no Grand Prix calendar", () => {
    assert.equal(buildSnapshot({ ...preseason, drivers: [] }, NOW), null);
    assert.equal(buildSnapshot({ ...preseason, meetings: [], sessions: [] }, NOW), null);
  });
});

describe("points system", () => {
  it("ships the 2026 tables, since OpenF1 does not publish them", () => {
    const { points } = build();
    assert.deepEqual(points.race, [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
    assert.deepEqual(points.sprint, [8, 7, 6, 5, 4, 3, 2, 1]);
  });
});

describe("cache lifetime", () => {
  const DAY = 86400;
  const snapshot = build();
  const at = (iso: string) => cacheSeconds(snapshot, new Date(iso));

  it("is capped at 3 days in the quiet middle of the calendar", () => {
    assert.equal(at("2026-10-12T08:00:00Z"), 3 * DAY); // the day after Singapore, next race in 13 days
  });

  it("runs until 30 minutes after the next Grand Prix ends once that is closer than 3 days", () => {
    // United States GP ends 2026-10-25 22:00Z, so results are expected from 22:30Z.
    assert.equal(at("2026-10-24T12:00:00Z"), 34.5 * 3600);
  });

  it("retries every 10 minutes while a race that just finished is missing from the standings", () => {
    const behind = buildSnapshot({ ...raw, championshipSessionKey: 11369 }, NOW)!;
    assert.equal(cacheSeconds(behind, NOW), 600); // Singapore ended 18 h ago, points not in yet
  });

  it("gives up retrying a race that has been missing for over a day", () => {
    const behind = buildSnapshot({ ...raw, championshipSessionKey: 11369 }, NOW)!;
    assert.equal(cacheSeconds(behind, new Date("2026-10-13T08:00:00Z")), 3 * DAY);
  });

  it("is capped at 3 days once the season is over", () => {
    assert.equal(at("2026-12-20T00:00:00Z"), 3 * DAY);
  });

  it("is 1 hour while still showing last season, so the new calendar is picked up promptly", () => {
    assert.equal(cacheSeconds(snapshot, new Date("2027-01-10T00:00:00Z")), 3600);
  });
});

describe("choosing the session to read standings from", () => {
  it("offers finished Grand Prix sessions newest first, skipping cancelled ones", () => {
    // 11388 Singapore (11 Oct), 11731 replacement Bahrain (4 Oct), 11377 Azerbaijan (26 Sep)
    assert.deepEqual(finishedRaceSessions(raw.sessions, NOW).slice(0, 3).map((s) => s.session_key), [11388, 11731, 11377]);
    assert.ok(!finishedRaceSessions(raw.sessions, NOW).some((s) => [11261, 11269].includes(s.session_key)));
  });

  it("does not offer a race that is still running", () => {
    const during = new Date("2026-10-25T20:00:00Z"); // United States GP in progress
    assert.equal(finishedRaceSessions(raw.sessions, during)[0]?.session_key, 11388);
  });

  it("falls back to the latest session that has started, for the grid before round 1", () => {
    const winterTesting = new Date("2026-02-12T00:00:00Z");
    assert.equal(finishedRaceSessions(raw.sessions, winterTesting).length, 0);
    const latest = latestStartedSession(raw.sessions, winterTesting)!;
    assert.ok(latest.date_start <= winterTesting.toISOString());
    assert.equal(latestStartedSession(raw.sessions, new Date("2025-01-01T00:00:00Z")), undefined);
  });
});
