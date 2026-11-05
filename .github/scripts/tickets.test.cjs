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
    comments: [], // { number, body }
    requested: [], // { pull, reviewers }
    next: 1,
  };
  const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });
  const issue = (n) => state.issues[n] || (() => { throw notFound(); })();
  const ok = (data) => Promise.resolve({ data });
  const rest = {
    issues: {
      get: async ({ issue_number }) => ok(structuredClone(issue(issue_number))),
      createComment: async ({ issue_number, body }) => { state.comments.push({ number: issue_number, body }); return ok({}); },
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
    repos: { get: async () => ok({ default_branch: 'main', node_id: 'R_1' }) },
    pulls: {
      list: async () => ok(Object.values(state.pulls).filter((p) => p.state === 'open')),
      update: async ({ pull_number, body }) => { state.pulls[pull_number].body = body; return ok({}); },
      requestReviewers: async ({ pull_number, reviewers }) => { state.requested.push({ pull: pull_number, reviewers }); return ok({}); },
      listReviews: async ({ pull_number }) => ok(state.reviews[pull_number] || []),
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
      state.pulls[n] = { number: n, head: { ref: head }, body, user: { login: by }, draft, state: 'open', merged: false };
      state.issues[n] = { number: n, node_id: `PR_${n}`, title: 'pr', body, labels: [], assignees: [], state: 'open', pull_request: {} };
      return state.pulls[n];
    },
    review(pull, login, st) {
      (state.reviews[pull.number] ||= []).push({ user: { login }, state: st });
    },
    status: (n) => t.statusOfLabels(state.issues[n].labels)?.key,
    commentsOn: (n) => state.comments.filter((c) => c.number === n).map((c) => c.body),
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
    assert.match(gh.commentsOn(1)[0], /Ticket commands/);

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
    assert.equal(gh.status(1), 'reviewed');
    assert.deepEqual(await bot.reviewGate(gh.state.pulls[pr.number]), { ok: true, message: 'Approved by the ticket reviewer.' });
    assert.ok(gh.commentsOn(pr.number).some((c) => /@ann, you're the reviewer/.test(c)));

    // 5. Ann merges.
    await bot.onPullRequest({ ...gh.state.pulls[pr.number], merged: true, merged_by: { login: 'ann' } }, 'closed');
    assert.equal(gh.status(1), 'done');
    assert.ok(!gh.state.issues[pr.number].labels.some((l) => l.name === 'merge rule broken'));
  });

  test('changes requested sends it back to in progress; new commits after approval need a new review', async () => {
    const gh = fakeGitHub();
    const bot = new t.TicketBot({ github: gh.github, context, core: silentCore() });
    gh.openIssue({ title: 'Fix typo', body: '### Reviewer\n\nann' });
    await bot.onIssueOpened(await bot.getIssue(1));
    await bot.onIssueComment(await bot.getIssue(1), '/start', 'bob');
    const pr = gh.openPull({ head: 'ticket/1-fix-typo', by: 'bob' });
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
    assert.ok(gh.commentsOn(pr.number).some((c) => /merged by @bob/.test(c)));
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
    assert.ok(gh.commentsOn(1).some((c) => /also assigned/.test(c)));
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
