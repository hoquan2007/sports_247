const PRODUCTION_INCIDENT_TITLE = '[SPORTS247] Production monitor failed';
const REHEARSAL_INCIDENT_TITLE = '[SPORTS247] Monitor alert rehearsal (test)';

async function openMonitorIncident({ github, context, rehearsalMode, monitorOutcome }) {
  const { owner, repo } = context.repo;
  const rehearsal = context.eventName === 'workflow_dispatch'
    && rehearsalMode === 'failure'
    && monitorOutcome === 'success';
  const title = rehearsal ? REHEARSAL_INCIDENT_TITLE : PRODUCTION_INCIDENT_TITLE;
  const link = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const at = new Date().toISOString();
  const body = rehearsal
    ? `TEST ONLY. Production probes passed. A synthetic incident was generated at ${at} to verify GitHub Issues alerts. [View workflow run](${link}).`
    : `Production monitor failed at ${at}. [View workflow run](${link}) and its diagnostics artifact.`;

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', per_page: 100,
  });
  const incident = issues.find((issue) => !issue.pull_request && issue.title === title);
  if (incident) {
    await github.rest.issues.createComment({ owner, repo, issue_number: incident.number, body });
  } else {
    await github.rest.issues.create({ owner, repo, title, body });
  }
}

async function resolveMonitorIncidents({ github, context, rehearsalMode }) {
  const { owner, repo } = context.repo;
  const titles = [PRODUCTION_INCIDENT_TITLE];
  if (context.eventName === 'workflow_dispatch' && rehearsalMode === 'recovery') {
    titles.push(REHEARSAL_INCIDENT_TITLE);
  }
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', per_page: 100,
  });
  for (const title of titles) {
    const incident = issues.find((issue) => !issue.pull_request && issue.title === title);
    if (!incident) continue;

    const link = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
    const at = new Date().toISOString();
    const body = title === REHEARSAL_INCIDENT_TITLE
      ? `TEST ONLY. Alert rehearsal resolved at ${at}. [View successful run](${link}).`
      : `Production monitor recovered at ${at}. [View successful run](${link}).`;
    await github.rest.issues.createComment({ owner, repo, issue_number: incident.number, body });
    await github.rest.issues.update({ owner, repo, issue_number: incident.number, state: 'closed' });
  }
}

module.exports = {
  PRODUCTION_INCIDENT_TITLE,
  REHEARSAL_INCIDENT_TITLE,
  openMonitorIncident,
  resolveMonitorIncidents,
};
