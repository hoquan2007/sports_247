import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEspnMatchDetails } from '../src/lib/football/match-details.ts';

const sample = {
  header: { competitions: [{ competitors: [
    { homeAway: 'home', team: { id: '363' } },
    { homeAway: 'away', team: { id: '360' } },
  ] }] },
  boxscore: {
    form: [{ team: { id: '363' } }, { team: { id: '360' } }],
    teams: [
      { team: { id: '363' }, statistics: [
        { name: 'possessionPct', displayValue: '58%', label: 'Possession' },
        { name: 'shotsOnTarget', displayValue: '7', label: 'Shots on Target' },
      ] },
      { team: { id: '360' }, statistics: [
        { name: 'possessionPct', displayValue: '42%', label: 'Possession' },
        { name: 'shotsOnTarget', displayValue: '3', label: 'Shots on Target' },
      ] },
    ],
  },
  rosters: [
    { formation: '4-2-3-1', roster: [
      { starter: true, jersey: '9', position: { abbreviation: 'FW' }, athlete: { id: 'a', displayName: 'Tiền đạo chủ nhà' } },
      { starter: false, jersey: '22', position: { abbreviation: 'MF' }, athlete: { id: 'b', displayName: 'Dự bị chủ nhà' } },
    ] },
    { formation: '4-3-3', roster: [
      { starter: true, jersey: '7', athlete: { id: 'c', displayName: 'Tiền đạo đội khách' } },
    ] },
  ],
  keyEvents: [
    { id: 'e1', clock: { displayValue: "52'" }, type: { text: 'Goal' }, team: { id: '363' },
      participants: [{ athlete: { displayName: 'Tiền đạo chủ nhà' } }], text: 'Goal after a corner' },
    { id: 'e2', clock: { displayValue: "67'" }, type: { text: 'Yellow Card' }, team: { id: '360' },
      text: 'Booked for a foul' },
  ],
  commentary: [{ id: 'c1', clock: { displayValue: "52'" }, text: 'The home side scores.' }],
  gameInfo: { attendance: 41000, officials: [{ displayName: 'A. Referee', position: { name: 'Referee' } }] },
};

test('ESPN soccer summary normalizes events, paired stats, lineups and match facts', () => {
  const detail = parseEspnMatchDetails(sample);
  assert.equal(detail.homeId, '363');
  assert.equal(detail.awayId, '360');
  assert.deepEqual(detail.statistics.map((item) => [item.label, item.home, item.away]), [
    ['Kiểm soát bóng', '58%', '42%'],
    ['Sút trúng đích', '7', '3'],
  ]);
  assert.equal(detail.statistics[0].homeValue, 58);
  assert.equal(detail.events[0].kind, 'goal');
  assert.match(detail.events[0].title, /Tiền đạo chủ nhà/);
  assert.equal(detail.events[1].kind, 'card');
  assert.equal(detail.lineups[0].formation, '4-2-3-1');
  assert.equal(detail.lineups[0].starters[0].number, '9');
  assert.equal(detail.lineups[0].substitutes[0].name, 'Dự bị chủ nhà');
  assert.equal(detail.lineups[1].teamId, '360');
  assert.equal(detail.commentary[0].minute, "52'");
  assert.equal(detail.attendance, '41000');
  assert.equal(detail.referee, 'A. Referee');
});

test('Scheduled match summary with missing sections returns no invented data', () => {
  const detail = parseEspnMatchDetails({ header: sample.header, boxscore: { teams: [] }, keyEvents: [] });
  assert.equal(detail.homeId, '363');
  assert.deepEqual(detail.statistics, []);
  assert.deepEqual(detail.lineups, []);
  assert.deepEqual(detail.events, []);
  assert.deepEqual(detail.commentary, []);
  assert.equal(detail.referee, null);
});

test('ESPN alternate event and formation fields remain usable', () => {
  const detail = parseEspnMatchDetails({
    header: sample.header,
    boxscore: { form: [{ team: { id: '363' }, formation: '4-4-2' }, { team: { id: '360' } }] },
    rosters: [
      { roster: [{ starter: true, athlete: { id: '4', displayName: 'Home player' } }] },
      { roster: [] },
    ],
    keyEvents: [{ type: { type: 'substitution' }, clock: { displayValue: "75'" },
      athletesInvolved: [{ displayName: 'Incoming player' }], team: { id: '363' } }],
  });
  assert.equal(detail.lineups[0].formation, '4-4-2');
  assert.equal(detail.events[0].kind, 'substitution');
  assert.match(detail.events[0].title, /Incoming player/);
});

test('Unrecognized and malformed provider sections are ignored safely', () => {
  const detail = parseEspnMatchDetails({ header: null, rosters: [{ roster: [{}] }], keyEvents: [null, {}] });
  assert.equal(detail.homeId, null);
  assert.equal(detail.awayId, null);
  assert.deepEqual(detail.lineups, []);
  assert.deepEqual(detail.events, []);
});
