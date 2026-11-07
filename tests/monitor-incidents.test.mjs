import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  PRODUCTION_INCIDENT_TITLE,
  REHEARSAL_INCIDENT_TITLE,
  openMonitorIncident,
  resolveMonitorIncidents,
} = require('../scripts/monitor-incidents.cjs');

function fakeGithub(initialIssues = []) {
  const issues = initialIssues.map((issue) => ({ ...issue }));
  const comments = [];
  const github = {
    paginate: async (_method, { state }) => issues.filter((issue) => issue.state === state),
    rest: {
      issues: {
        listForRepo: () => {},
        create: async ({ title, body }) => {
          issues.push({ number: issues.length + 1, title, body, state: 'open' });
        },
        createComment: async ({ issue_number, body }) => {
          comments.push({ issue_number, body });
        },
        update: async ({ issue_number, state }) => {
          const issue = issues.find(({ number }) => number === issue_number);
          assert.ok(issue);
          issue.state = state;
        },
      },
    },
  };
  return { github, issues, comments };
}

function context(eventName = 'workflow_dispatch') {
  return {
    eventName,
    serverUrl: 'https://github.com',
    runId: '12345',
    repo: { owner: 'example', repo: 'sports_247' },
  };
}

test('healthy production probes and failure rehearsal open a clearly marked test issue', async () => {
  const fake = fakeGithub();
  await openMonitorIncident({
    github: fake.github, context: context(), rehearsalMode: 'failure', monitorOutcome: 'success',
  });
  assert.equal(fake.issues.length, 1);
  assert.equal(fake.issues[0].title, REHEARSAL_INCIDENT_TITLE);
  assert.match(fake.issues[0].body, /TEST ONLY\. Production probes passed/);
  assert.match(fake.issues[0].body, /actions\/runs\/12345/);
});

test('real monitor failure remains a production incident even during a rehearsal request', async () => {
  const fake = fakeGithub();
  await openMonitorIncident({
    github: fake.github, context: context(), rehearsalMode: 'failure', monitorOutcome: 'failure',
  });
  assert.equal(fake.issues[0].title, PRODUCTION_INCIDENT_TITLE);
  assert.doesNotMatch(fake.issues[0].body, /TEST ONLY/);
});

test('push failures are always production incidents and repeat failures comment once', async () => {
  const fake = fakeGithub();
  const args = {
    github: fake.github, context: context('push'), rehearsalMode: 'failure', monitorOutcome: 'success',
  };
  await openMonitorIncident(args);
  await openMonitorIncident(args);
  assert.equal(fake.issues.length, 1);
  assert.equal(fake.issues[0].title, PRODUCTION_INCIDENT_TITLE);
  assert.equal(fake.comments.length, 1);
});

test('scheduled recovery closes real incidents without closing rehearsal issues', async () => {
  const fake = fakeGithub([
    { number: 1, title: PRODUCTION_INCIDENT_TITLE, state: 'open' },
    { number: 2, title: REHEARSAL_INCIDENT_TITLE, state: 'open' },
  ]);
  await resolveMonitorIncidents({ github: fake.github, context: context('schedule'), rehearsalMode: 'recovery' });
  assert.equal(fake.issues[0].state, 'closed');
  assert.equal(fake.issues[1].state, 'open');
  assert.equal(fake.comments.length, 1);
  assert.match(fake.comments[0].body, /Production monitor recovered/);
});

test('explicit healthy recovery resolves the rehearsal issue and is repeat-safe', async () => {
  const fake = fakeGithub([
    { number: 1, title: REHEARSAL_INCIDENT_TITLE, state: 'open' },
  ]);
  const args = { github: fake.github, context: context(), rehearsalMode: 'recovery' };
  await resolveMonitorIncidents(args);
  await resolveMonitorIncidents(args);
  assert.equal(fake.issues[0].state, 'closed');
  assert.equal(fake.comments.length, 1);
  assert.match(fake.comments[0].body, /TEST ONLY\. Alert rehearsal resolved/);
});
