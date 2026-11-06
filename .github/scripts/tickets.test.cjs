// Tests for the ticket automation, using an in-memory fake of the GitHub API.
// Run: npm run test:automation
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const t = require('./tickets.cjs');

// ------------------------------------------------------------------ fake GitHub

function fakeGitHub() {
  const state = {
    labels: [],
    issues: {}, // number → issue (also PRs, with pull_request: {})
    pulls: {}, // number → pull
    reviews: {}, // pull number → [{ user, state }]
    refs: { 'heads/main': 'sha-main' },
    comments: [], // { number, body, user }
    admins: [], // logins with admin permission
    prCommits: {}, // commit sha → [pull requests]
    reruns: [],
    // Review gate runs on a pull request's commit, one per triggering event (see rerunReviewGate).
    workflowRuns: [{ id: 77, event: 'pull_request', status: 'completed', conclusion: 'failure', created_at: '2026-11-05T07:00:00Z' }],
    checks: {}, // commit sha → check runs ({ name, status, conclusion })
    merges: [], // { pull, sha, method }
    dispatches: [], // { workflow, ref, inputs }
    clock: 0, // fake time: every review, comment and commit gets the next minute
    headTimes: {}, // head sha → commit time
    requested: [], // { pull, reviewers }
    next: 1,
  };
  const tick = () => new Date(Date.UTC(2026, 10, 5, 8, state.clock++)).toISOString();
  const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });
  const issue = (n) => state.issues[n] || (() => { throw notFound(); })();
  const ok = (data) => Promise.resolve({ data });
  const rest = {
    issues: {
      get: async ({ issue_number }) => ok(structuredClone(issue(issue_number))),
      createComment: async ({ issue_number, body }) => { state.comments.push({ number: issue_number, body, user: { login: 'github-actions[bot]' }, created_at: tick() }); return ok({}); },
      listComments: async ({ issue_number }) => ok(state.comments.filter((c) => c.number === issue_number)),
      create: async ({ title, body, labels, assignees }) => {
        const n = state.next++;
        state.issues[n] = { number: n, node_id: `I_${n}`, title, body, labels: labels.map((name) => ({ name })), assignees: assignees.map((login) => ({ login })), state: 'open' };
        return ok(state.issues[n]);
      },
      update: async ({ issue_number, body }) => { issue(issue_number).body = body; return ok({}); },
      addLabels: async ({ issue_number, labels }) => {
        const i = issue(issue_number);
        for (const name of labels) if (!i.labels.some((l) => l.name === name)) i.labels.push({ name });
        return ok({});
      },
      removeLabel: async ({ issue_number, name }) => {
        const i = issue(issue_number);
        if (!i.labels.some((l) => l.name === name)) throw notFound();
        i.labels = i.labels.filter((l) => l.name !== name);
        return ok({});
      },
      addAssignees: async ({ issue_number, assignees }) => {
        const i = issue(issue_number);
        for (const a of assignees) if (!i.assignees.some((x) => x.login === a)) i.assignees.push({ login: a });
        return ok({});
      },
      removeAssignees: async ({ issue_number, assignees }) => {
        const i = issue(issue_number);
        i.assignees = i.assignees.filter((x) => !assignees.includes(x.login));
        return ok({});
      },
      listLabelsForRepo: async () => ok(state.labels),
      createLabel: async (l) => { state.labels.push({ name: l.name }); return ok({}); },
      listForRepo: async () => ok(Object.values(state.issues).filter((i) => i.state === 'open')),
    },
    git: {
      getRef: async ({ ref }) => (state.refs[ref] ? ok({ object: { sha: state.refs[ref] } }) : Promise.reject(notFound())),
      createRef: async ({ ref, sha }) => { state.refs[ref.replace(/^refs\//, '')] = sha; return ok({}); },
    },
    repos: {
      get: async () => ok({ default_branch: 'main', node_id: 'R_1' }),
      getCollaboratorPermissionLevel: async ({ username }) => ok({ permission: state.admins.includes(username) ? 'admin' : 'write' }),
      listPullRequestsAssociatedWithCommit: async ({ commit_sha }) => ok(state.prCommits[commit_sha] || []),
      getCommit: async ({ ref }) => ok({ commit: { committer: { date: state.headTimes[ref] || '2026-11-05T07:00:00.000Z' } } }),
    },
    actions: {
      listWorkflowRuns: async () => ok({ workflow_runs: state.workflowRuns }),
      reRunWorkflow: async ({ run_id }) => { state.reruns.push(run_id); return ok({}); },
      createWorkflowDispatch: async ({ workflow_id, ref, inputs }) => { state.dispatches.push({ workflow: workflow_id, ref, inputs }); return ok({}); },
    },
    checks: {
      listForRef: async ({ ref }) => ok(typeof state.checks[ref] === 'function' ? state.checks[ref]() : state.checks[ref] || []),
    },
    pulls: {
      list: async () => ok(Object.values(state.pulls).filter((p) => p.state === 'open')),
      get: async ({ pull_number }) => ok(structuredClone(state.pulls[pull_number])),
      update: async ({ pull_number, body }) => { state.pulls[pull_number].body = body; return ok({}); },
      requestReviewers: async ({ pull_number, reviewers }) => { state.requested.push({ pull: pull_number, reviewers }); return ok({}); },
      listReviews: async ({ pull_number }) => ok(state.reviews[pull_number] || []),
      merge: async ({ pull_number, sha, merge_method }) => {
        const p = state.pulls[pull_number];
        if (p.merged) throw Object.assign(new Error('Pull Request is not mergeable'), { status: 405 });
        Object.assign(p, { merged: true, state: 'closed', merged_by: { login: 'github-actions[bot]' } });
        state.merges.push({ pull: pull_number, sha, method: merge_method });
        return ok({ merged: true });
      },
    },
  };
  const github = {
    rest,
    paginate: async (fn, params) => (await fn(params)).data,
    graphql: async (_q, vars) => {
      state.refs[vars.name.replace(/^refs\//, '')] = vars.oid;
      return {};
    },
  };
  const helpers = {
    openIssue({ title, body = '', by = 'eric', labels = [] }) {
      const n = state.next++;
      state.issues[n] = { number: n, node_id: `I_${n}`, title, body, labels: labels.map((name) => ({ name })), assignees: [], state: 'open', user: { login: by } };
      return state.issues[n];
    },
    openPull({ head, body = '', by, draft = false }) {
      const n = state.next++;
      state.pulls[n] = { number: n, head: { ref: head, sha: `sha-${n}` }, base: { ref: 'main' }, body, user: { login: by }, draft, state: 'open', merged: false };
      state.headTimes[`sha-${n}`] = tick();
      state.issues[n] = { number: n, node_id: `PR_${n}`, title: 'pr', body, labels: [], assignees: [], state: 'open', pull_request: {} };
      return state.pulls[n];
    },
    review(pull, login, st) {
      (state.reviews[pull.number] ||= []).push({ user: { login }, state: st, submitted_at: tick(), commit_id: state.pulls[pull.number].head.sha });
    },
    push(pull) {
      const sha = `${state.pulls[pull.number].head.sha}+`;
      state.pulls[pull.number].head.sha = sha;
      state.headTimes[sha] = tick();
    },
    status: (n) => t.statusOfLabels(state.issues[n].labels)?.key,
    commentsOn: (n) => state.comments.filter((c) => c.number === n).map((c) => c.body),
    say(n, login, body) {
      state.comments.push({ number: n, body, user: { login }, created_at: tick() });
    },
  };
  return { github, state, ...helpers };
}

const silentCore = () => ({ info() {}, warning() {}, setFailed(m) { this.failed = m; }, failed: null });
const context = { repo: { owner: 'Adventurer-E', repo: 'FamilyShield' }, serverUrl: 'https://github.com' };

function fakeBoard() {
  const moves = [];
  return {
    moves,
    add: async () => 'item',
    setStatus: async (id, status) => moves.push(`${id}:${status}`),
    items: async () => [],
  };
}

// ------------------------------------------------------------------ pure helpers

describe('helpers', () => {
  test('branch names are short, lowercase and safe', () => {
    assert.equal(t.branchName(12, 'Add dark mode to the Repay screen!'), 'ticket/12-add-dark-mode-to-the-repay-screen');
    assert.equal(t.branchName(3, 'Ünïcödé & émojis 🎉'), 'ticket/3-unicode-emojis');
    assert.equal(t.branchName(4, '!!!'), 'ticket/4-ticket');
    assert.ok(t.branchName(5, 'x'.repeat(100)).length <= 'ticket/5-'.length + 40);
  });

  test('commands are read line by line', () => {
    assert.deepEqual(t.parseCommands('Taking this!\n/start\n/reviewer @ann bo'), [
      { name: 'start', args: '' },
      { name: 'reviewer', args: '@ann bo' },
    ]);
    assert.deepEqual(t.parseCommands('see https://x/y/z and a/b'), []);
  });

  test('user lists understand me, @names and commas', () => {
    assert.deepEqual(t.parseUsers('me, @ann bo @ann', 'eric'), ['eric', 'ann', 'bo']);
    assert.deepEqual(t.parseUsers('@not--valid @-x', 'eric'), []);
  });

  test('statuses accept many spellings', () => {
    for (const s of ['in progress', 'In Progress', 'in-progress', 'status: in progress', 'IN_PROGRESS']) assert.equal(t.findStatus(s).key, 'in-progress');
    assert.equal(t.findStatus('nope'), null);
  });

  test('reviewer comes from the issue form, then from the bot block', () => {
    assert.deepEqual(t.parseMeta('### What\n\nStuff\n\n### Reviewer\n\n@ann\n\n### Notes\n\nx').reviewers, ['ann']);
    assert.deepEqual(t.parseMeta('### Reviewer\n\n_No response_\n').reviewers, []);
    assert.deepEqual(t.parseMeta('### Reviewer\n\nNobody yet (decide later)\n').reviewers, [], 'the dropdown\'s "nobody" choice');
    const body = t.withMeta('text', { reviewers: [], branch: null }, 'https://x');
    assert.deepEqual(t.parseMeta(body), { reviewers: [], branch: null, hasBlock: true });
    const again = t.withMeta(body, { reviewers: ['ann', 'bo'], branch: 'ticket/1-x' }, 'https://x');
    assert.equal(again.match(/ticket-meta:start/g).length, 1, 'block is replaced, not duplicated');
    assert.deepEqual(t.parseMeta(again), { reviewers: ['ann', 'bo'], branch: 'ticket/1-x', hasBlock: true });
  });

  test('pull requests link to tickets by branch name and by "Closes #n"', () => {
    assert.deepEqual(t.linkedIssueNumbers({ head: { ref: 'ticket/7-x' }, body: '' }), [7]);
    assert.deepEqual(t.linkedIssueNumbers({ head: { ref: 'feature' }, body: 'Fixes #3, closes #4. See #5' }).sort(), [3, 4]);
  });

  test('the latest review per person wins; comments are ignored', () => {
    const latest = t.latestReviews([
      { user: { login: 'Ann' }, state: 'CHANGES_REQUESTED' },
      { user: { login: 'ann' }, state: 'COMMENTED' },
      { user: { login: 'ann' }, state: 'APPROVED' },
    ]);
    assert.deepEqual(latest, { ann: 'APPROVED' });
  });

  test('approvals on an older commit no longer count', () => {
    const reviews = [{ user: { login: 'ann' }, state: 'APPROVED', commit_id: 'old' }, { user: { login: 'bo' }, state: 'CHANGES_REQUESTED', commit_id: 'old' }];
    assert.deepEqual(t.latestReviews(reviews, 'new'), { ann: 'STALE_APPROVAL', bo: 'CHANGES_REQUESTED' });
    assert.deepEqual(t.latestReviews(reviews, 'old'), { ann: 'APPROVED', bo: 'CHANGES_REQUESTED' });
  });
});

// ------------------------------------------------------------------ whole flow

describe('a ticket from icebox to done', () => {
  test('the happy path', async () => {
    const gh = fakeGitHub();
    const board = fakeBoard();
    const core = silentCore();
    const bot = new t.TicketBot({ github: gh.github, context, core, board });

    // 1. Eric files a ticket with the form, naming Ann as reviewer.
    const issue = gh.openIssue({ title: 'Add dark mode', body: '### What and why\n\nDark mode.\n\n### Reviewer\n\n@ann', labels: ['status: icebox'] });
    await bot.onIssueOpened(structuredClone(issue));
    assert.equal(gh.status(1), 'icebox');
    assert.ok(gh.state.labels.some((l) => l.name === 'status: under review'), 'labels created');
    assert.deepEqual(t.parseMeta(gh.state.issues[1].body).reviewers, ['ann']);
    assert.ok(board.moves.includes('I_1:Icebox'));
    assert.deepEqual(gh.commentsOn(1), [], 'no welcome comment on new tickets');

    // 2. Bob picks it up.
    await bot.onIssueComment(await bot.getIssue(1), '/start', 'bob');
    assert.equal(gh.status(1), 'in-progress');
    assert.deepEqual(gh.state.issues[1].assignees, [{ login: 'bob' }]);
    assert.equal(gh.state.refs['heads/ticket/1-add-dark-mode'], 'sha-main', 'branch created from main');
    assert.equal(t.parseMeta(gh.state.issues[1].body).branch, 'ticket/1-add-dark-mode');
    assert.ok(board.moves.includes('I_1:In progress'));

    // 3. Bob opens a pull request from the ticket branch, without "Closes".
    const pr = gh.openPull({ head: 'ticket/1-add-dark-mode', by: 'bob' });
    await bot.onPullRequest(structuredClone(pr), 'opened');
    assert.match(gh.state.pulls[pr.number].body, /Closes #1/);
    assert.equal(gh.status(1), 'under-review');
    assert.deepEqual(gh.state.requested, [{ pull: pr.number, reviewers: ['ann'] }], 'Ann is notified');

    // 4. The gate stays red until Ann approves.
    assert.equal((await bot.reviewGate(gh.state.pulls[pr.number])).ok, false);
    gh.review(pr, 'carl', 'APPROVED'); // not the ticket's reviewer
    assert.equal((await bot.reviewGate(gh.state.pulls[pr.number])).ok, false);
    gh.review(pr, 'ann', 'APPROVED');
    await bot.onReview(gh.state.pulls[pr.number], { user: { login: 'ann' }, state: 'approved' });
    assert.equal(gh.status(1), 'done'); // approved, checks green → merged right away
    assert.deepEqual(await bot.reviewGate(gh.state.pulls[pr.number]), { ok: true, message: 'Approved by the ticket reviewer.' });
    assert.ok(gh.commentsOn(pr.number).some((c) => /Approved by @ann, the ticket’s reviewer\. It merges automatically/.test(c)));

    // 5. The checks are green, so the bot merges right away.
    assert.deepEqual(gh.state.merges, [{ pull: pr.number, sha: `sha-${pr.number}`, method: 'merge' }]);
    assert.equal(gh.status(1), 'done');
    assert.ok(gh.commentsOn(pr.number).some((c) => /Merged automatically\*\*: approved by the ticket reviewer, and every check passed/.test(c)));
    assert.ok(!gh.state.issues[pr.number].labels.some((l) => l.name === 'merge rule broken'));
  });

  test('changes requested sends it back to in progress; new commits after approval need a new review', async () => {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore(), mergeWaitMs: 0, sleep: async () => {} });
    gh.openIssue({ title: 'Fix typo', body: '### Reviewer\n\n@ann' });
    await bot.onIssueOpened(await bot.getIssue(1));
    await bot.onIssueComment(await bot.getIssue(1), '/start', 'bob');
    const pr = gh.openPull({ head: 'ticket/1-fix-typo', by: 'bob' });
    gh.state.checks[pr.head.sha] = [{ name: 'Checks', status: 'in_progress' }]; // CI still running: no merge yet
    await bot.onPullRequest(pr, 'opened');

    gh.review(pr, 'ann', 'CHANGES_REQUESTED');
    await bot.onReview(pr, { user: { login: 'ann' }, state: 'changes_requested' });
    assert.equal(gh.status(1), 'in-progress');
    assert.match((await bot.reviewGate(pr)).message, /Changes requested by @ann/);

    gh.review(pr, 'ann', 'APPROVED');
    await bot.onReview(pr, { user: { login: 'ann' }, state: 'approved' });
    assert.equal(gh.status(1), 'reviewed');
    await bot.onPullRequest(pr, 'synchronize');
    assert.equal(gh.status(1), 'under-review');
  });

  test('merging by someone other than the reviewer is flagged', async () => {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    gh.openIssue({ title: 'X', body: '### Reviewer\n\n@ann' });
    await bot.onIssueOpened(await bot.getIssue(1));
    const pr = gh.openPull({ head: 'other', body: 'Closes #1', by: 'bob' });
    await bot.onPullRequest({ ...pr, merged: true, merged_by: { login: 'bob' } }, 'closed');
    assert.equal(gh.status(1), 'done');
    assert.ok(gh.state.issues[pr.number].labels.some((l) => l.name === 'merge rule broken'));
    assert.ok(gh.commentsOn(pr.number).some((c) => /merged by hand by @bob/.test(c)));
  });

  test('a pull request without a ticket is told so, and the gate fails', async () => {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    const pr = gh.openPull({ head: 'random', by: 'bob' });
    await bot.onPullRequest(pr, 'opened');
    assert.match(gh.commentsOn(pr.number)[0], /isn’t linked to a ticket/);
    assert.match((await bot.reviewGate(pr)).message, /Not linked/);
  });

  test('draft pull requests keep the ticket in progress', async () => {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    gh.openIssue({ title: 'Y', body: '### Reviewer\n\n@ann' });
    await bot.onIssueOpened(await bot.getIssue(1));
    const pr = gh.openPull({ head: 'ticket/1-y', by: 'bob', draft: true });
    await bot.onPullRequest(pr, 'opened');
    assert.equal(gh.status(1), 'in-progress');
    assert.deepEqual(gh.state.requested, []);
    await bot.onPullRequest({ ...pr, draft: false }, 'ready_for_review');
    assert.equal(gh.status(1), 'under-review');
  });
});

describe('commands', () => {
  async function setup() {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    gh.openIssue({ title: 'Z' });
    await bot.onIssueOpened(await bot.getIssue(1));
    return { gh, bot, say: async (text, who) => bot.onIssueComment(await bot.getIssue(1), text, who) };
  }

  test('reviewers: add, self-add, remove, clear', async () => {
    const { gh, say } = await setup();
    assert.ok(gh.state.issues[1].labels.some((l) => l.name === 'needs reviewer'));
    await say('/reviewer @ann @bo', 'eric');
    await say('/review', 'cy');
    assert.deepEqual(t.parseMeta(gh.state.issues[1].body).reviewers, ['ann', 'bo', 'cy']);
    assert.ok(!gh.state.issues[1].labels.some((l) => l.name === 'needs reviewer'));
    await say('/reviewer remove @bo', 'eric');
    assert.deepEqual(t.parseMeta(gh.state.issues[1].body).reviewers, ['ann', 'cy']);
    await say('/reviewer clear', 'eric');
    assert.deepEqual(t.parseMeta(gh.state.issues[1].body).reviewers, []);
  });

  test('warns when the assignee is also the reviewer', async () => {
    const { gh, say } = await setup();
    await say('/start', 'bob');
    await say('/reviewer me', 'bob');
    assert.ok(gh.commentsOn(1).some((c) => /both assignee and reviewer/.test(c) && /In principle, a ticket’s reviewer is not its assignee/.test(c) && /administrator/.test(c)));
  });

  test('status by hand, and helpful errors', async () => {
    const { gh, say } = await setup();
    await say('/status under review', 'eric');
    assert.equal(gh.status(1), 'under-review');
    assert.ok(gh.commentsOn(1).some((c) => /no open pull request/.test(c)));
    await say('/status nonsense', 'eric');
    await say('/status done', 'eric');
    await say('/frobnicate', 'eric');
    const all = gh.commentsOn(1).join('\n');
    assert.match(all, /Unknown status "nonsense"/);
    assert.match(all, /set automatically when the pull request is merged/);
    assert.match(all, /Unknown command `\/frobnicate`/);
  });

  test('only one status label at a time', async () => {
    const { gh, say } = await setup();
    await say('/start', 'bob');
    await say('/status icebox', 'bob');
    const statusLabels = gh.state.issues[1].labels.filter((l) => l.name.startsWith('status:'));
    assert.deepEqual(statusLabels, [{ name: 'status: icebox' }]);
  });

  test('commands on pull requests are ignored', async () => {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    const pr = gh.openPull({ head: 'x', by: 'bob' });
    await bot.onIssueComment(gh.state.issues[pr.number], '/start', 'bob');
    assert.deepEqual(gh.state.comments, []);
  });
});

// ------------------------------------------------------------------ board (Projects v2 GraphQL)

describe('board', () => {
  test('finds the project and moves a card to the matching column', async () => {
    const calls = [];
    const fetchImpl = async (_url, init) => {
      const { query, variables } = JSON.parse(init.body);
      calls.push({ query, variables });
      if (query.includes('repositoryOwner')) {
        return { json: async () => ({ data: { repositoryOwner: { projectV2: { id: 'P1', title: 'Board', field: { id: 'F1', options: [{ id: 'o1', name: 'Icebox' }, { id: 'o2', name: 'In Progress' }] } } } } }) };
      }
      if (query.includes('projectItems')) return { json: async () => ({ data: { node: { projectItems: { nodes: [{ id: 'IT1', project: { id: 'P1' } }] } } } }) };
      if (query.includes('updateProjectV2ItemFieldValue')) return { json: async () => ({ data: {} }) };
      throw new Error('unexpected query');
    };
    const board = new t.Board({ token: 'x', owner: 'Adventurer-E', number: 1, fetchImpl });
    await board.setStatus('I_1', 'In progress'); // case-insensitive match to "In Progress"
    const update = calls.find((c) => c.query.includes('updateProjectV2ItemFieldValue'));
    assert.deepEqual(update.variables, { project: 'P1', item: 'IT1', field: 'F1', option: 'o2' });
    await assert.rejects(board.setStatus('I_1', 'Reviewed'), /has no "Reviewed" column/);
  });

  test('a board move is applied to the ticket on the next sync', async () => {
    const gh = fakeGitHub();
    const board = fakeBoard();
    gh.openIssue({ title: 'Dragged', labels: ['status: icebox'] });
    board.items = async () => [{ issueNumber: 1, repo: 'Adventurer-E/FamilyShield', status: 'In progress' }];
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore(), board });
    await bot.syncBoard();
    assert.equal(gh.status(1), 'in-progress');
    assert.ok(gh.state.refs['heads/ticket/1-dragged'], 'dragging to In progress creates the branch too');
  });
});

// ------------------------------------------------------------------ rules "in principle"

describe('rule exceptions', () => {
  async function selfReviewed({ admins = [] } = {}) {
    const gh = fakeGitHub();
    gh.state.admins.push(...admins);
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    gh.openIssue({ title: 'Hotfix', body: '### Reviewer\n\n@bob' }); // bob reviews his own ticket
    await bot.onIssueOpened(await bot.getIssue(1));
    await bot.onIssueComment(await bot.getIssue(1), '/start', 'bob');
    const pr = gh.openPull({ head: 'ticket/1-hotfix', by: 'bob' });
    await bot.onPullRequest(pr, 'opened');
    return { gh, bot, pr };
  }
  const prIssue = (gh, pr) => gh.state.issues[pr.number];

  test('assignee-reviewers are told the rule, and the gate waits', async () => {
    const { gh, bot, pr } = await selfReviewed();
    assert.ok(gh.commentsOn(pr.number).some((c) => /both assignee and reviewer/.test(c) && /\/self-approve/.test(c)));
    assert.equal((await bot.reviewGate(gh.state.pulls[pr.number])).ok, false);
  });

  test('/self-approve with a reason records the exception and opens the gate', async () => {
    const { gh, bot, pr } = await selfReviewed();
    gh.say(pr.number, 'bob', '/self-approve Production is down and Ann is on a flight');
    await bot.onIssueComment(prIssue(gh, pr), '/self-approve Production is down and Ann is on a flight', 'bob');
    assert.ok(prIssue(gh, pr).labels.some((l) => l.name === 'rule exception'));
    assert.equal(gh.status(1), 'done'); // approved, checks green → merged right away
    assert.deepEqual(gh.state.reruns, [77], 'the Review gate is re-run');
    assert.ok(gh.commentsOn(pr.number).some((c) => /Rule exception recorded/.test(c)));
    assert.deepEqual(await bot.reviewGate(gh.state.pulls[pr.number]), { ok: true, message: 'Rule exception recorded by @bob: Production is down and Ann is on a flight' });
  });

  test('a reason is required, and others cannot self-approve', async () => {
    const { gh, bot, pr } = await selfReviewed();
    await bot.onIssueComment(prIssue(gh, pr), '/self-approve', 'bob');
    assert.ok(gh.commentsOn(pr.number).some((c) => /give the reason/.test(c)));
    gh.say(pr.number, 'carl', '/self-approve I think it is fine honestly');
    await bot.onIssueComment(prIssue(gh, pr), '/self-approve I think it is fine honestly', 'carl');
    assert.ok(gh.commentsOn(pr.number).some((c) => /only for a ticket reviewer who is also its assignee, or for a repository administrator/.test(c)));
    assert.equal((await bot.reviewGate(gh.state.pulls[pr.number])).ok, false, "carl's comment doesn't count");
  });

  test('administrators may record an exception', async () => {
    const { gh, bot, pr } = await selfReviewed({ admins: ['eric'] });
    gh.say(pr.number, 'eric', '/self-approve Demo for the bank in an hour');
    await bot.onIssueComment(prIssue(gh, pr), '/self-approve Demo for the bank in an hour', 'eric');
    assert.match((await bot.reviewGate(gh.state.pulls[pr.number])).message, /@eric: Demo for the bank/);
  });

  test('direct pushes to main are recorded, not blocked; merges are not', async () => {
    const gh = fakeGitHub();
    gh.state.admins.push('eric');
    gh.state.prCommits['merged1'] = [{ number: 5, merged_at: '2026-11-05T00:00:00Z' }];
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    await bot.onPushToMain({ pusher: { name: 'ann' }, commits: [{ id: 'merged1', message: 'Merge pull request #5' }] });
    assert.equal(Object.keys(gh.state.issues).length, 0, 'a merged pull request is not an exception');

    await bot.onPushToMain({ pusher: { name: 'eric' }, commits: [{ id: 'abc1234567', message: 'Fix typo on home\n\nlong text' }] });
    const record = Object.values(gh.state.issues)[0];
    assert.match(record.title, /Direct push to main by @eric/);
    assert.deepEqual(record.labels, [{ name: 'rule exception' }]);
    assert.deepEqual(record.assignees, [{ login: 'eric' }]);
    assert.match(record.body, /as a repository administrator/);
    assert.match(record.body, /In principle, every change reaches `main` through a ticket branch/);
    assert.match(record.body, /`abc1234`.* Fix typo on home/);

    await bot.onPushToMain({ pusher: { name: 'github-actions[bot]' }, commits: [{ id: 'x', message: 'bot' }] });
    assert.equal(Object.keys(gh.state.issues).length, 1, 'bot pushes are ignored');
  });
});

describe('assignees (who created the ticket doesn’t matter)', () => {
  async function open(body = '') {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    gh.openIssue({ title: 'Task', body, by: 'someone-else' });
    await bot.onIssueOpened(await bot.getIssue(1));
    return { gh, bot, say: async (text, who) => bot.onIssueComment(await bot.getIssue(1), text, who) };
  }
  const assignees = (gh) => gh.state.issues[1].assignees.map((a) => a.login);

  test('a ticket can be created assigned (form field) or unassigned', async () => {
    assert.deepEqual(assignees((await open('### Assignee\n\n@bo\n\n### Reviewer\n\n@ann')).gh), ['bo']);
    assert.deepEqual(assignees((await open('### Assignee\n\n_No response_\n\n### Reviewer\n\n@ann')).gh), []);
    assert.deepEqual(assignees((await open('### Assignee\n\nNobody yet (decide later)\n\n### Reviewer\n\n@ann')).gh), []);
  });

  test('anyone can assign, self-assign, reassign and unassign', async () => {
    const { gh, say } = await open();
    await say('/assign me', 'carl');
    await say('/assign @dee', 'eric');
    assert.deepEqual(assignees(gh), ['carl', 'dee']);
    await say('/reassign @bo', 'eric');
    assert.deepEqual(assignees(gh), ['bo']);
    await say('/unassign @bo', 'bo');
    assert.deepEqual(assignees(gh), []);
  });

  test('assigning the reviewer reminds everyone of the rule', async () => {
    const { gh, say } = await open('### Reviewer\n\n@ann');
    await say('/assign @ann', 'eric');
    assert.ok(gh.commentsOn(1).some((c) => /@ann is both assignee and reviewer/.test(c)));
  });

  test('who opened the pull request doesn’t matter: the reviewer approves with /approve', async () => {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    gh.openIssue({ title: 'Help', body: '### Reviewer\n\n@ann', by: 'ann' }); // Ann wrote the ticket, nobody is assigned
    await bot.onIssueOpened(await bot.getIssue(1));
    const pr = gh.openPull({ head: 'ticket/1-help', by: 'ann' }); // and Ann opened the pull request
    await bot.onPullRequest(pr, 'opened');
    assert.deepEqual(gh.state.requested, [], 'GitHub cannot request a review from the opener');
    assert.ok(gh.commentsOn(pr.number).some((c) => /approve by commenting `\/approve`/.test(c)));
    assert.ok(!gh.commentsOn(pr.number).some((c) => /both assignee and reviewer/.test(c)), 'no assignee, so no rule issue');
    assert.match((await bot.reviewGate(gh.state.pulls[pr.number])).message, /comment "\/approve"/);

    gh.say(pr.number, 'ann', '/approve');
    await bot.onIssueComment(gh.state.issues[pr.number], '/approve', 'ann');
    assert.equal(gh.status(1), 'done'); // approved, checks green → merged right away
    assert.deepEqual(gh.state.reruns, [77]);
    assert.ok(!gh.state.issues[pr.number].labels.some((l) => l.name === 'rule exception'), 'not an exception');
    assert.deepEqual(await bot.reviewGate(gh.state.pulls[pr.number]), { ok: true, message: 'Approved by the ticket reviewer.' });

    gh.push(pr); // new commit after the approval
    assert.equal((await bot.reviewGate(gh.state.pulls[pr.number])).ok, false, 'needs a fresh /approve');
    gh.say(pr.number, 'ann', '/approve');
    assert.equal((await bot.reviewGate(gh.state.pulls[pr.number])).ok, true);
  });

  test('/approve is only for a reviewer who isn’t the assignee', async () => {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    gh.openIssue({ title: 'X', body: '### Assignee\n\n@bo\n\n### Reviewer\n\n@bo' });
    await bot.onIssueOpened(await bot.getIssue(1));
    const pr = gh.openPull({ head: 'ticket/1-x', by: 'carl' });
    await bot.onPullRequest(pr, 'opened');
    gh.say(pr.number, 'bo', '/approve');
    await bot.onIssueComment(gh.state.issues[pr.number], '/approve', 'bo');
    assert.ok(gh.commentsOn(pr.number).some((c) => /both the assignee and the reviewer/.test(c)));
    gh.review(pr, 'bo', 'APPROVED'); // the Approve button doesn't count either
    await bot.onReview(gh.state.pulls[pr.number], { user: { login: 'bo' }, state: 'approved' });
    assert.notEqual(gh.status(1), 'reviewed');
    assert.match((await bot.reviewGate(gh.state.pulls[pr.number])).message, /both assignee and reviewer of #1/);
    gh.say(pr.number, 'dee', '/approve');
    await bot.onIssueComment(gh.state.issues[pr.number], '/approve', 'dee');
    assert.ok(gh.commentsOn(pr.number).some((c) => /only the ticket’s reviewer can `\/approve`/.test(c)));
    assert.equal((await bot.reviewGate(gh.state.pulls[pr.number])).ok, false, "dee isn't the reviewer");
  });
});

describe('automatic merge after approval', () => {
  // A ticket reviewed by Ann, worked on by Bob, with a pull request open.
  async function setup(opts = {}) {
    const gh = fakeGitHub();
    const core = silentCore();
    const naps = [];
    const bot = new t.TicketBot({ github: gh.github, context, core, mergeWaitMs: opts.mergeWaitMs ?? 60_000, pollMs: 10_000, sleep: async (ms) => naps.push(ms) });
    gh.openIssue({ title: 'Ship it', body: '### Reviewer\n\n@ann' });
    await bot.onIssueOpened(await bot.getIssue(1));
    await bot.onIssueComment(await bot.getIssue(1), '/start', 'bob');
    const pr = gh.openPull({ head: 'ticket/1-ship-it', by: 'bob', draft: opts.draft });
    await bot.onPullRequest(structuredClone(pr), 'opened');
    const approve = async () => {
      gh.review(pr, 'ann', 'APPROVED');
      await bot.onReview(gh.state.pulls[pr.number], { user: { login: 'ann' }, state: 'approved' });
    };
    return { gh, bot, core, pr, naps, approve };
  }

  test('the Approve button re-runs the out-of-date red Review gate, not the new green one', async () => {
    const { gh, pr, approve } = await setup();
    gh.state.workflowRuns = [
      { id: 77, event: 'pull_request', status: 'completed', conclusion: 'failure', created_at: '2026-11-05T14:32:33Z' },
      { id: 70, event: 'pull_request', status: 'completed', conclusion: 'failure', created_at: '2026-11-05T14:21:22Z' }, // older, same event
      { id: 78, event: 'pull_request_review', status: 'completed', conclusion: 'success', created_at: '2026-11-06T17:25:23Z' },
    ];
    await approve();
    assert.deepEqual(gh.state.reruns, [77]);
    assert.equal(gh.state.merges.length, 1);
    assert.equal(gh.state.merges[0].pull, pr.number);
  });

  test('waits for running checks, then merges and does what a merge would have started', async () => {
    const { gh, pr, naps, approve } = await setup();
    let looks = 0;
    gh.state.checks[pr.head.sha] = () => {
      looks++;
      return [
        { name: 'tickets', status: 'in_progress' }, // the bot itself: ignored
        { name: 'Review gate', status: 'completed', conclusion: looks < 2 ? 'failure' : 'success' }, // being re-run
        { name: 'Checks', status: looks < 3 ? 'in_progress' : 'completed', conclusion: looks < 3 ? null : 'success' },
        { name: 'deploy', status: 'completed', conclusion: 'success' },
      ];
    };
    await approve();
    assert.equal(looks, 3);
    assert.deepEqual(naps, [10_000, 10_000]);
    assert.equal(gh.state.merges.length, 1);
    assert.equal(gh.status(1), 'done');
    assert.deepEqual(gh.state.dispatches, [
      { workflow: 'ci.yml', ref: 'main', inputs: {} },
      { workflow: 'pages.yml', ref: 'main', inputs: { remove_preview: String(pr.number) } },
    ]);
  });

  test('checks still running after the wait: merged when they finish', async () => {
    const { gh, bot, pr, approve } = await setup({ mergeWaitMs: 0 });
    gh.state.checks[pr.head.sha] = [{ name: 'Checks', status: 'in_progress' }];
    await approve();
    assert.equal(gh.state.merges.length, 0);
    assert.equal(gh.status(1), 'reviewed');

    gh.state.checks[pr.head.sha] = [{ name: 'Checks', status: 'completed', conclusion: 'success' }];
    await t.main({ github: gh.github, core: silentCore(), context: { ...context, eventName: 'workflow_run', payload: { workflow_run: { status: 'completed', head_sha: pr.head.sha, pull_requests: [{ number: pr.number, head: { sha: pr.head.sha } }] } } } });
    assert.equal(gh.state.merges.length, 1);
    assert.equal(gh.status(1), 'done');
    await bot.onWorkflowRun({ status: 'completed', head_sha: pr.head.sha, pull_requests: [{ number: pr.number }] });
    assert.equal(gh.state.merges.length, 1, 'only merged once');
  });

  test('a failed check stops the merge and says why', async () => {
    const { gh, pr, approve } = await setup();
    gh.state.checks[pr.head.sha] = [{ name: 'Checks', status: 'completed', conclusion: 'failure' }];
    await approve();
    assert.equal(gh.state.merges.length, 0);
    assert.ok(gh.commentsOn(pr.number).some((c) => /not merged: \*\*Checks\*\* failed/.test(c)));
  });

  test('no merge without approval, for drafts, or when a commit lands while waiting', async () => {
    let s = await setup();
    await s.bot.onWorkflowRun({ status: 'completed', head_sha: s.pr.head.sha, pull_requests: [{ number: s.pr.number }] });
    assert.equal(s.gh.state.merges.length, 0, 'CI finishing alone does not merge');

    s = await setup({ draft: true });
    await s.approve();
    assert.equal(s.gh.state.merges.length, 0, 'drafts are held');

    s = await setup();
    const { gh, pr } = s;
    let looks = 0;
    gh.state.checks[pr.head.sha] = () => {
      if (++looks === 1) return [{ name: 'Checks', status: 'in_progress' }];
      gh.push(pr); // Bob pushes again while CI runs
      return [];
    };
    await s.approve();
    assert.equal(gh.state.merges.length, 0, 'the new commit was never approved');
  });

  test('a bot merge is not flagged; a merge by hand by someone else still is', async () => {
    const { gh, bot, pr } = await setup();
    await bot.onPullRequest({ ...gh.state.pulls[pr.number], merged: true, merged_by: { login: 'github-actions[bot]' } }, 'closed');
    assert.ok(!gh.state.issues[pr.number].labels.some((l) => l.name === 'merge rule broken'));
  });
});
