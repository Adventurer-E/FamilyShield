// Ticket automation for the FamilyShield Kanban workflow.
//
//   Icebox ──/start──▶ In progress ──PR opened──▶ Under review ──approved──▶ Reviewed ──merged──▶ Done
//                        (branch created)          (reviewers requested)     (reviewer merges)
//
// Status is stored twice, kept in sync by this script:
//   * a label on the issue ("status: in progress"), which works without any setup
//   * the Status column on the GitHub Projects board (needs PROJECT_TOKEN + PROJECT_NUMBER)
// The reviewer list and branch live in a bot-managed block at the end of the issue body.
//
// Runs inside actions/github-script (see .github/workflows/tickets.yml and review-gate.yml).
// Tested by tickets.test.cjs with a fake GitHub client: `npm run test:automation`.
'use strict';

// ------------------------------------------------------------------ statuses

const STATUSES = [
  { key: 'icebox', label: 'status: icebox', board: 'Icebox', color: 'c5def5', description: 'Ticket not started yet' },
  { key: 'in-progress', label: 'status: in progress', board: 'In progress', color: 'fbca04', description: 'Someone is working on it; a branch exists' },
  { key: 'under-review', label: 'status: under review', board: 'Under review', color: 'd4c5f9', description: 'Pull request open; waiting for the reviewer' },
  { key: 'reviewed', label: 'status: reviewed', board: 'Reviewed', color: '0e8a16', description: 'Approved; the reviewer merges it' },
  { key: 'done', label: 'status: done', board: 'Done', color: '5319e7', description: 'Merged into main' },
];
const EXTRA_LABELS = [
  { name: 'needs reviewer', color: 'e99695', description: 'Nobody is set to review this ticket yet' },
  { name: 'merge rule broken', color: 'b60205', description: 'Merged by someone other than the ticket reviewer' },
  { name: 'rule exception', color: 'ff7619', description: 'A team rule was set aside (emergency or administrator), with a recorded reason' },
];

/** The two "in principle" rules, worded once so every message says the same thing. */
const RULES = {
  selfReview:
    'In principle, a ticket’s reviewer is not its assignee. Only in an emergency or other extenuating circumstances, or as a repository administrator, may the assignee also review the work, using `/self-approve <reason>` on the pull request.',
  directPush:
    'In principle, every change reaches `main` through a ticket branch and a reviewed pull request. Only in an emergency or other extenuating circumstances, or as a repository administrator, may someone push to `main` directly.',
};

const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
const byKey = (key) => STATUSES.find((s) => s.key === key);
/** "in progress", "In Progress", "in-progress", "status: in progress" → status object */
function findStatus(text) {
  const t = norm(String(text || '').replace(/^status:\s*/i, ''));
  return STATUSES.find((s) => norm(s.key) === t || norm(s.board) === t || norm(s.label) === t) || null;
}
function statusOfLabels(labels) {
  for (const l of labels || []) {
    const name = typeof l === 'string' ? l : l.name;
    if (/^status:/i.test(name)) {
      const s = findStatus(name);
      if (s) return s;
    }
  }
  return null;
}

// ------------------------------------------------------------------ pure helpers

function slugify(title) {
  return (
    String(title || 'ticket')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'ticket'
  );
}
const branchName = (number, title) => `ticket/${number}-${slugify(title)}`;

/** Commands are lines starting with "/", e.g. "/reviewer @ann @bo". */
function parseCommands(body) {
  const out = [];
  for (const raw of String(body || '').split(/\r?\n/)) {
    const m = /^\s*\/([a-z-]+)\b(.*)$/i.exec(raw);
    if (m) out.push({ name: m[1].toLowerCase(), args: m[2].trim() });
  }
  return out;
}

/** "me @ann bo, @cy" → ['actor', 'ann', 'bo', 'cy'] (deduplicated, valid GitHub logins only) */
function parseUsers(args, actor) {
  const users = String(args || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((u) => (u.toLowerCase() === 'me' ? actor : u.replace(/^@/, '')))
    .filter((u) => /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(u));
  return [...new Set(users)];
}

const META_START = '<!-- ticket-meta:start -->';
const META_END = '<!-- ticket-meta:end -->';

/** Reads the bot block, falling back to the issue form's "### Reviewer" answer. */
function parseMeta(body) {
  const text = String(body || '');
  const block = text.includes(META_START) ? text.slice(text.indexOf(META_START), text.indexOf(META_END) + META_END.length) : '';
  if (block) {
    const reviewers = /Reviewer\(s\):\*\*\s*([^\n·]*)/.exec(block);
    const branch = /Branch:\*\*\s*\[?`([^`]+)`/.exec(block);
    // Only @mentions count inside the bot block, so hint text is never mistaken for a name.
    const mentions = reviewers ? [...reviewers[1].matchAll(/@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})/gi)].map((m) => m[1]) : [];
    return {
      reviewers: [...new Set(mentions)],
      branch: branch ? branch[1] : null,
      hasBlock: true,
    };
  }
  return { reviewers: parseFormField(text, 'Reviewer'), branch: null, hasBlock: false };
}

/**
 * The users chosen in an issue-form answer ("### Assignee\n\n@ann"). Only @names count,
 * so "Nobody yet (decide later)" and "_No response_" give [].
 */
function parseFormField(body, label) {
  const m = new RegExp(`###\\s*${label}[^\\n]*\\n+([^\\n#]*)`, 'i').exec(String(body || ''));
  const answer = m ? m[1] : '';
  return [...new Set([...answer.matchAll(/@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})/gi)].map((x) => x[1]))];
}

function renderMeta(meta, repoUrl) {
  const reviewers = meta.reviewers.length ? meta.reviewers.map((r) => `@${r}`).join(' ') : '_none yet: comment `/reviewer me`_';
  const branch = meta.branch ? `[\`${meta.branch}\`](${repoUrl}/tree/${meta.branch.split('/').map(encodeURIComponent).join('/')})` : '_created on_ `/start`';
  return `${META_START}\n\n---\n🤖 **Reviewer(s):** ${reviewers} · **Branch:** ${branch}\n${META_END}`;
}

function withMeta(body, meta, repoUrl) {
  const text = String(body || '');
  const block = renderMeta(meta, repoUrl);
  if (text.includes(META_START) && text.includes(META_END)) {
    return text.slice(0, text.indexOf(META_START)) + block + text.slice(text.indexOf(META_END) + META_END.length);
  }
  return `${text.trimEnd()}\n\n${block}`;
}

const lc = (s) => String(s || '').toLowerCase();
/** Is this person a reviewer on every ticket the pull request belongs to? */
function reviewerOfAll(login, issues) {
  return issues.length > 0 && issues.every((i) => parseMeta(i.body).reviewers.some((r) => lc(r) === lc(login)));
}
/** Is this person assigned to any of the tickets? */
function assigneeOfAny(login, issues) {
  return issues.some((i) => (i.assignees || []).some((a) => lc(a.login) === lc(login)));
}

/** Ticket numbers a PR belongs to: its branch name (ticket/12-…) and "Closes #12" in its description. */
function linkedIssueNumbers(pr) {
  const nums = new Set();
  const fromBranch = /^ticket\/(\d+)-/.exec((pr.head && pr.head.ref) || '');
  if (fromBranch) nums.add(Number(fromBranch[1]));
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;
  let m;
  while ((m = re.exec(pr.body || ''))) nums.add(Number(m[1]));
  return [...nums];
}

/**
 * Latest review state per user (APPROVED / CHANGES_REQUESTED / …), ignoring plain comments.
 * With `headSha`, an approval only counts if it was given on that exact commit, so pushing new
 * commits after an approval needs a fresh look. Requested changes keep blocking until re-reviewed.
 */
function latestReviews(reviews, headSha) {
  const latest = {};
  for (const r of reviews) {
    if (!r.user || r.state === 'COMMENTED' || r.state === 'PENDING') continue;
    const stale = headSha && r.commit_id && r.commit_id !== headSha;
    latest[r.user.login.toLowerCase()] = stale && r.state === 'APPROVED' ? 'STALE_APPROVAL' : r.state;
  }
  return latest;
}

const HELP = [
  '**Ticket commands**: write them as a comment on this ticket:',
  '',
  '| Command | Does |',
  '| --- | --- |',
  '| `/start` | Move to **In progress**, assign you if nobody is assigned, and create the branch |',
  '| `/assign me` · `/assign @name` | Add an assignee (you can also use **Assignees** on the right) |',
  '| `/reassign @name` | Replace whoever is assigned with someone else |',
  '| `/unassign me` · `/unassign @name` | Remove an assignee |',
  '| `/reviewer me` · `/reviewer @name` | Add a reviewer (`/review` is short for `/reviewer me`) |',
  '| `/reviewer remove @name` · `/reviewer clear` | Remove one or all reviewers |',
  '| `/status icebox` · `in progress` · `under review` · `reviewed` | Set the status by hand (you can also drag the card on the board) |',
  '| `/help` | Show this list |',
  '',
  'Anyone can create a ticket, assign it, change the assignee or assign themselves. Who created a ticket doesn’t matter; the **assignee** does the work and the **reviewer** reviews and merges it.',
  '',
  'On a **pull request**: the reviewer can comment `/approve` (same as the Approve button, which GitHub hides from whoever opened the pull request). `/self-approve <reason>` records a rule exception when the assignee must also review the work (emergencies, or administrators).',
  '',
  'Status moves on its own, too: opening a pull request → **Under review** (reviewers are notified), approval → **Reviewed**, merge → **Done**.',
].join('\n');

// ------------------------------------------------------------------ the bot

class TicketBot {
  /**
   * @param {object} o
   * @param {object} o.github   octokit from actions/github-script
   * @param {object} o.context  @actions/github context
   * @param {object} o.core     @actions/core
   * @param {object} [o.board]  optional Board (Projects v2); null when not configured
   */
  constructor({ github, context, core, board }) {
    this.github = github;
    this.context = context;
    this.core = core;
    this.board = board || null;
    this.repo = context.repo; // { owner, repo }
    this.repoUrl = `${context.serverUrl || 'https://github.com'}/${context.repo.owner}/${context.repo.repo}`;
  }

  log(msg) {
    this.core.info(msg);
  }

  async comment(number, body) {
    await this.github.rest.issues.createComment({ ...this.repo, issue_number: number, body });
  }

  async getIssue(number) {
    return (await this.github.rest.issues.get({ ...this.repo, issue_number: number })).data;
  }

  async ensureLabels() {
    const existing = new Set(
      (await this.github.paginate(this.github.rest.issues.listLabelsForRepo, { ...this.repo, per_page: 100 })).map((l) => l.name.toLowerCase()),
    );
    for (const l of [...STATUSES.map((s) => ({ name: s.label, color: s.color, description: s.description })), ...EXTRA_LABELS]) {
      if (!existing.has(l.name.toLowerCase())) {
        await this.github.rest.issues.createLabel({ ...this.repo, ...l });
        this.log(`created label ${l.name}`);
      }
    }
  }

  async saveMeta(issue, meta) {
    const body = withMeta(issue.body, meta, this.repoUrl);
    if (body !== issue.body) {
      await this.github.rest.issues.update({ ...this.repo, issue_number: issue.number, body });
      issue.body = body;
    }
    const needs = meta.reviewers.length === 0;
    const has = (issue.labels || []).some((l) => (l.name || l) === 'needs reviewer');
    if (needs && !has) await this.github.rest.issues.addLabels({ ...this.repo, issue_number: issue.number, labels: ['needs reviewer'] });
    if (!needs && has) await this.github.rest.issues.removeLabel({ ...this.repo, issue_number: issue.number, name: 'needs reviewer' }).catch(() => {});
  }

  /** Move a ticket to a status: one status label, the board column, and the side effects. */
  async setStatus(issue, key, { actor, quiet = false } = {}) {
    const status = byKey(key);
    const current = statusOfLabels(issue.labels);
    // labels: exactly one status label
    for (const l of issue.labels || []) {
      const name = l.name || l;
      if (/^status:/i.test(name) && name !== status.label) {
        await this.github.rest.issues.removeLabel({ ...this.repo, issue_number: issue.number, name }).catch(() => {});
      }
    }
    if (!current || current.key !== key) {
      await this.github.rest.issues.addLabels({ ...this.repo, issue_number: issue.number, labels: [status.label] });
    }
    issue.labels = [...(issue.labels || []).filter((l) => !/^status:/i.test(l.name || l)), { name: status.label }];
    if (this.board) await this.board.setStatus(issue.node_id, status.board).catch((e) => this.core.warning(`board: ${e.message}`));
    this.log(`#${issue.number}: ${current ? current.board : '(none)'} → ${status.board}`);

    if (key === 'in-progress') await this.onInProgress(issue, { actor, quiet });
    if (key === 'under-review') await this.onUnderReview(issue, { quiet });
  }

  async onInProgress(issue, { actor, quiet }) {
    const meta = parseMeta(issue.body);
    if (!(issue.assignees || []).length && actor) {
      await this.github.rest.issues.addAssignees({ ...this.repo, issue_number: issue.number, assignees: [actor] });
      issue.assignees = [{ login: actor }];
    }
    const name = meta.branch || branchName(issue.number, issue.title);
    const created = await this.ensureBranch(issue, name);
    if (meta.branch !== name) await this.saveMeta(issue, { ...meta, branch: name });
    if (created && !quiet) {
      await this.comment(
        issue.number,
        [
          `🚧 **In progress.** Branch \`${name}\` was created from \`main\`. To work on it:`,
          '',
          '```bash',
          'git fetch origin',
          `git switch ${name}`,
          '```',
          '',
          `When it's ready, open a pull request from that branch (the description should say \`Closes #${issue.number}\`). The ticket moves to **Under review** and the reviewer is notified.`,
        ].join('\n'),
      );
    }
  }

  /** Creates the branch from main and links it to the issue (Development panel). Returns true if new. */
  async ensureBranch(issue, name) {
    try {
      await this.github.rest.git.getRef({ ...this.repo, ref: `heads/${name}` });
      return false;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    const repoData = (await this.github.rest.repos.get(this.repo)).data;
    const base = repoData.default_branch;
    const sha = (await this.github.rest.git.getRef({ ...this.repo, ref: `heads/${base}` })).data.object.sha;
    try {
      // Linked branches show up in the issue's "Development" panel.
      await this.github.graphql(
        `mutation($issueId: ID!, $repositoryId: ID!, $oid: GitObjectID!, $name: String!) {
          createLinkedBranch(input: { issueId: $issueId, repositoryId: $repositoryId, oid: $oid, name: $name }) { linkedBranch { id } }
        }`,
        { issueId: issue.node_id, repositoryId: repoData.node_id, oid: sha, name: `refs/heads/${name}` },
      );
    } catch (e) {
      this.core.warning(`linked branch failed (${e.message}); creating a plain branch`);
      await this.github.rest.git.createRef({ ...this.repo, ref: `refs/heads/${name}`, sha });
    }
    this.log(`created branch ${name}`);
    return true;
  }

  async openPullsFor(issue) {
    const pulls = await this.github.paginate(this.github.rest.pulls.list, { ...this.repo, state: 'open', per_page: 100 });
    return pulls.filter((p) => linkedIssueNumbers(p).includes(issue.number));
  }

  async onUnderReview(issue, { quiet }) {
    const meta = parseMeta(issue.body);
    const pulls = (await this.openPullsFor(issue)).filter((p) => !p.draft);
    if (!pulls.length) {
      if (!quiet) await this.comment(issue.number, `ℹ️ Moved to **Under review**, but there's no open pull request for this ticket yet. Open one from \`${meta.branch || branchName(issue.number, issue.title)}\` with \`Closes #${issue.number}\` in its description.`);
      return;
    }
    if (!meta.reviewers.length) {
      await this.comment(issue.number, `⚠️ This ticket is **Under review** but has no reviewer. Someone please comment \`/reviewer me\`, or the author can comment \`/reviewer @name\`.`);
      return;
    }
    const assignees = (issue.assignees || []).map((a) => a.login.toLowerCase());
    const both = meta.reviewers.filter((r) => assignees.includes(r.toLowerCase()));
    for (const pr of pulls) {
      // GitHub can't request a review from the person who opened the pull request.
      const opener = pr.user.login.toLowerCase();
      const reviewers = meta.reviewers.filter((r) => r.toLowerCase() !== opener);
      if (reviewers.length) {
        await this.github.rest.pulls.requestReviewers({ ...this.repo, pull_number: pr.number, reviewers }).catch((e) => this.core.warning(`requestReviewers: ${e.message}`));
      }
      const notes = [];
      if (both.length) notes.push(`⚠️ ${both.map((r) => `@${r}`).join(' ')} is both assignee and reviewer of #${issue.number}. ${RULES.selfReview}`);
      if (reviewers.length < meta.reviewers.length && !both.some((r) => r.toLowerCase() === opener)) {
        notes.push(`ℹ️ @${pr.user.login}, you opened this pull request and you’re the reviewer of #${issue.number}. GitHub hides the Approve button from whoever opened a pull request, so approve by commenting \`/approve\` here instead. It counts the same.`);
      }
      if (notes.length) await this.comment(pr.number, notes.join('\n\n'));
    }
    if (!quiet) {
      await this.comment(issue.number, `👀 **Under review.** ${meta.reviewers.map((r) => `@${r}`).join(' ')}: your review is requested on ${pulls.map((p) => `#${p.number}`).join(', ')}. When you approve, merging is your job.`);
    }
  }

  // ---------------------------------------------------------------- event handlers

  async onIssueOpened(issue) {
    await this.ensureLabels();
    const meta = parseMeta(issue.body);
    await this.saveMeta(issue, meta);
    // Optional "Assignee" answer on the ticket form (anyone can fill it in).
    const wanted = parseFormField(issue.body, 'Assignee');
    if (wanted.length) {
      await this.github.rest.issues.addAssignees({ ...this.repo, issue_number: issue.number, assignees: wanted });
      issue.assignees = [...(issue.assignees || []), ...wanted.map((login) => ({ login }))];
    }
    if (this.board) await this.board.add(issue.node_id).catch((e) => this.core.warning(`board: ${e.message}`));
    if (!statusOfLabels(issue.labels)) await this.setStatus(issue, 'icebox', { quiet: true });
    else if (this.board) await this.board.setStatus(issue.node_id, statusOfLabels(issue.labels).board).catch(() => {});
    await this.comment(issue.number, `Thanks for the ticket! It's in **Icebox**.\n\n${HELP}`);
  }

  async onIssueLabeled(issue, label, actor) {
    const status = findStatus(label);
    if (!status || !/^status:/i.test(label)) return;
    await this.setStatus(issue, status.key, { actor });
  }

  async isAdmin(login) {
    try {
      const { data } = await this.github.rest.repos.getCollaboratorPermissionLevel({ ...this.repo, username: login });
      return data.permission === 'admin';
    } catch {
      return false;
    }
  }

  /**
   * May this person record a self-approval exception on this pull request?
   * Only administrators, and a ticket reviewer who is also its assignee (the
   * one situation the "assignee ≠ reviewer" rule is about).
   */
  async canSelfApprove(login, pr, issues) {
    if (await this.isAdmin(login)) return { ok: true, as: 'administrator' };
    if (reviewerOfAll(login, issues) && assigneeOfAny(login, issues)) return { ok: true, as: 'assignee and reviewer' };
    return { ok: false };
  }

  /** Comments on a pull request: /approve and /self-approve are understood there. */
  async onPullRequestComment(prNumber, commentBody, actor) {
    const all = parseCommands(commentBody);
    if (all.some((c) => c.name === 'approve')) return this.onApproveComment(prNumber, actor);
    const commands = all.filter((c) => c.name === 'self-approve' || c.name === 'exception');
    if (!commands.length) return;
    const reason = commands[0].args.trim();
    const pr = (await this.github.rest.pulls.get({ ...this.repo, pull_number: prNumber })).data;
    const issues = await this.issuesFor(pr);
    if (!issues.length) return this.comment(prNumber, '⚠️ `/self-approve` needs the pull request to be linked to a ticket first (`Closes #<number>`).');
    if (reason.length < 10) return this.comment(prNumber, `⚠️ Please give the reason, e.g. \`/self-approve Production fix while the reviewer is away\`.\n\n${RULES.selfReview}`);
    const who = await this.canSelfApprove(actor, pr, issues);
    if (!who.ok) {
      return this.comment(
        prNumber,
        `⚠️ @${actor}, \`/self-approve\` is only for a ticket reviewer who is also its assignee, or for a repository administrator. ${RULES.selfReview}${
          reviewerOfAll(actor, issues) ? ' You’re the reviewer and not the assignee, so just comment `/approve`.' : ''
        }`,
      );
    }
    await this.github.rest.issues.addLabels({ ...this.repo, issue_number: prNumber, labels: ['rule exception'] });
    for (const issue of issues) await this.setStatus(issue, 'reviewed', { quiet: true });
    await this.comment(prNumber, `🟠 **Rule exception recorded** by @${actor} (${who.as}): “${reason}”\n\n${RULES.selfReview} This exception is kept on the pull request and its \`rule exception\` label. The Review gate will now pass.`);
    await this.rerunReviewGate(pr);
  }

  /**
   * "/approve": the ticket's reviewer approves by comment. It counts exactly like
   * GitHub's Approve button, which GitHub hides from whoever opened the pull request.
   */
  async onApproveComment(prNumber, actor) {
    const pr = (await this.github.rest.pulls.get({ ...this.repo, pull_number: prNumber })).data;
    const issues = await this.issuesFor(pr);
    if (!issues.length) return this.comment(prNumber, '⚠️ `/approve` needs the pull request to be linked to a ticket first (`Closes #<number>`).');
    if (!reviewerOfAll(actor, issues)) {
      return this.comment(prNumber, `⚠️ @${actor}, only the ticket’s reviewer can \`/approve\`. To become the reviewer, comment \`/review\` on ${issues.map((i) => `#${i.number}`).join(', ')}.`);
    }
    if (assigneeOfAny(actor, issues)) {
      return this.comment(prNumber, `⚠️ @${actor}, you’re both the assignee and the reviewer, so your approval doesn’t count on its own. ${RULES.selfReview}`);
    }
    for (const issue of issues) await this.setStatus(issue, 'reviewed', { quiet: true });
    await this.comment(prNumber, `✅ Approved by @${actor}, the ticket’s reviewer. @${actor}, please **merge** when the checks are green.`);
    await this.rerunReviewGate(pr);
  }

  /** Re-run the latest Review gate check for the pull request's current commit. */
  async rerunReviewGate(pr) {
    try {
      const { data } = await this.github.rest.actions.listWorkflowRuns({ ...this.repo, workflow_id: 'review-gate.yml', head_sha: pr.head.sha, per_page: 1 });
      const run = data.workflow_runs && data.workflow_runs[0];
      if (run) await this.github.rest.actions.reRunWorkflow({ ...this.repo, run_id: run.id });
    } catch (e) {
      this.core.warning(`Couldn't re-run the Review gate (${e.message}); it updates on the next push or review.`);
    }
  }

  /** Every self-approval exception on a pull request that came from someone allowed to make it. */
  async validExceptions(pr, issues) {
    const comments = await this.github.paginate(this.github.rest.issues.listComments, { ...this.repo, issue_number: pr.number, per_page: 100 });
    const out = [];
    for (const c of comments) {
      const cmd = parseCommands(c.body).find((x) => x.name === 'self-approve' || x.name === 'exception');
      if (!cmd || cmd.args.trim().length < 10 || !c.user || /\[bot\]$/.test(c.user.login)) continue;
      if ((await this.canSelfApprove(c.user.login, pr, issues)).ok) out.push({ by: c.user.login, reason: cmd.args.trim() });
    }
    return out;
  }

  async onIssueComment(issue, commentBody, actor) {
    if (issue.pull_request) return this.onPullRequestComment(issue.number, commentBody, actor);
    const commands = parseCommands(commentBody);
    if (!commands.length) return;
    const replies = [];
    let meta = parseMeta(issue.body);
    for (const { name, args } of commands) {
      if (name === 'help') {
        replies.push(HELP);
      } else if (name === 'start') {
        await this.setStatus(issue, 'in-progress', { actor });
      } else if (name === 'assign' || name === 'unassign' || name === 'reassign') {
        const users = parseUsers(args || 'me', actor);
        if (!users.length) {
          replies.push(`⚠️ \`/${name}\` needs a name, e.g. \`/${name} me\` or \`/${name} @ann\`.`);
          continue;
        }
        const current = (issue.assignees || []).map((a) => a.login);
        if (name === 'reassign') {
          const drop = current.filter((c) => !users.some((u) => u.toLowerCase() === c.toLowerCase()));
          if (drop.length) await this.github.rest.issues.removeAssignees({ ...this.repo, issue_number: issue.number, assignees: drop });
        }
        if (name === 'unassign') await this.github.rest.issues.removeAssignees({ ...this.repo, issue_number: issue.number, assignees: users });
        else await this.github.rest.issues.addAssignees({ ...this.repo, issue_number: issue.number, assignees: users });
        issue.assignees =
          name === 'unassign'
            ? (issue.assignees || []).filter((a) => !users.some((u) => u.toLowerCase() === a.login.toLowerCase()))
            : name === 'reassign'
              ? users.map((login) => ({ login }))
              : [...(issue.assignees || []), ...users.filter((u) => !current.some((c) => c.toLowerCase() === u.toLowerCase())).map((login) => ({ login }))];
        replies.push(`✅ ${name === 'unassign' ? 'Unassigned' : 'Assigned'} ${users.map((u) => `@${u}`).join(' ')}.`);
        if (name !== 'unassign') {
          const both = users.filter((u) => meta.reviewers.some((r) => r.toLowerCase() === u.toLowerCase()));
          if (both.length) replies.push(`⚠️ ${both.map((r) => `@${r}`).join(' ')} is both assignee and reviewer. ${RULES.selfReview}`);
        }
      } else if (name === 'review' || name === 'reviewer' || name === 'reviewers') {
        let reviewers = [...meta.reviewers];
        const words = (name === 'review' ? 'me' : args).trim();
        if (/^clear$/i.test(words)) reviewers = [];
        else if (/^remove\b/i.test(words)) {
          const drop = parseUsers(words.replace(/^remove\b/i, ''), actor).map((u) => u.toLowerCase());
          reviewers = reviewers.filter((r) => !drop.includes(r.toLowerCase()));
        } else {
          const add = parseUsers(words || 'me', actor);
          for (const u of add) if (!reviewers.some((r) => r.toLowerCase() === u.toLowerCase())) reviewers.push(u);
        }
        meta = { ...meta, reviewers };
        await this.saveMeta(issue, meta);
        replies.push(reviewers.length ? `✅ Reviewer(s): ${reviewers.map((r) => `@${r}`).join(' ')}` : '✅ No reviewers now.');
        const assignees = (issue.assignees || []).map((a) => a.login.toLowerCase());
        const both = reviewers.filter((r) => assignees.includes(r.toLowerCase()));
        if (both.length) replies.push(`⚠️ ${both.map((r) => `@${r}`).join(' ')} is both assignee and reviewer. ${RULES.selfReview}`);
        // Already under review? Ask the new reviewers right away.
        if (statusOfLabels(issue.labels)?.key === 'under-review') await this.onUnderReview(issue, { quiet: true });
      } else if (name === 'status') {
        const s = findStatus(args);
        if (!s) replies.push(`⚠️ Unknown status "${args}". Use one of: ${STATUSES.map((x) => `\`${x.board.toLowerCase()}\``).join(', ')}.`);
        else if (s.key === 'done') replies.push('⚠️ **Done** is set automatically when the pull request is merged.');
        else await this.setStatus(issue, s.key, { actor });
      } else {
        replies.push(`⚠️ Unknown command \`/${name}\`. Comment \`/help\` for the list.`);
      }
    }
    if (replies.length) await this.comment(issue.number, replies.join('\n\n'));
  }

  async issuesFor(pr) {
    const out = [];
    for (const n of linkedIssueNumbers(pr)) {
      try {
        const issue = await this.getIssue(n);
        if (!issue.pull_request) out.push(issue);
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    return out;
  }

  async onPullRequest(pr, action) {
    if (action === 'closed') return this.onPullRequestClosed(pr);
    const issues = await this.issuesFor(pr);
    if (!issues.length) {
      if (action === 'opened') {
        await this.comment(pr.number, '⚠️ This pull request isn’t linked to a ticket. Add `Closes #<ticket number>` to its description (or work on the branch that `/start` created). The **Review gate** check stays red until it is.');
      }
      return;
    }
    // Make sure merging closes the ticket.
    const missing = issues.filter((i) => !new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s+#${i.number}\\b`, 'i').test(pr.body || ''));
    if (missing.length) {
      const body = `${(pr.body || '').trimEnd()}\n\n${missing.map((i) => `Closes #${i.number}`).join('\n')}`;
      await this.github.rest.pulls.update({ ...this.repo, pull_number: pr.number, body });
      pr.body = body;
    }
    for (const issue of issues) {
      const status = statusOfLabels(issue.labels);
      if (pr.draft || action === 'converted_to_draft') {
        if (!status || status.key !== 'in-progress') await this.setStatus(issue, 'in-progress', { quiet: true });
      } else if (['opened', 'reopened', 'ready_for_review'].includes(action)) {
        await this.setStatus(issue, 'under-review', {});
      } else if (action === 'synchronize' && status && status.key === 'reviewed') {
        // New commits after approval: approvals are dismissed, so it needs another look.
        await this.setStatus(issue, 'under-review', { quiet: true });
        await this.comment(issue.number, `🔁 New commits were pushed to #${pr.number} after approval, so it's back **Under review**.`);
      }
    }
  }

  async onPullRequestClosed(pr) {
    if (!pr.merged) return;
    for (const issue of await this.issuesFor(pr)) {
      await this.setStatus(issue, 'done', { quiet: true });
      const reviewers = parseMeta(issue.body).reviewers.map((r) => r.toLowerCase());
      const merger = pr.merged_by ? pr.merged_by.login : 'unknown';
      if (!reviewers.includes(merger.toLowerCase())) {
        await this.github.rest.issues.addLabels({ ...this.repo, issue_number: pr.number, labels: ['merge rule broken'] }).catch(() => {});
        await this.comment(
          pr.number,
          `⚠️ Team rule: the ticket's reviewer (${reviewers.length ? reviewers.map((r) => `@${r}`).join(' ') : 'none set'}) merges. This was merged by @${merger}. No action needed now; just a reminder for next time.`,
        );
      }
    }
  }

  async onReview(pr, review) {
    for (const issue of await this.issuesFor(pr)) {
      const reviewers = parseMeta(issue.body).reviewers.map((r) => r.toLowerCase());
      const who = review.user.login;
      if (!reviewers.includes(who.toLowerCase())) continue;
      const state = String(review.state).toUpperCase();
      if (state === 'APPROVED' && assigneeOfAny(who, [issue])) {
        await this.comment(pr.number, `⚠️ @${who} is both assignee and reviewer of #${issue.number}, so this approval doesn’t count on its own. ${RULES.selfReview}`);
      } else if (state === 'APPROVED') {
        await this.setStatus(issue, 'reviewed', { quiet: true });
        await this.comment(pr.number, `✅ Approved by @${who}. @${who}, you're the reviewer, so please **merge** when the checks are green.`);
      } else if (state === 'CHANGES_REQUESTED') {
        await this.setStatus(issue, 'in-progress', { quiet: true });
        const assignees = (issue.assignees || []).map((a) => `@${a.login}`).join(' ') || `@${pr.user.login}`;
        await this.comment(issue.number, `✏️ @${who} requested changes on #${pr.number}. ${assignees}: back to **In progress**. Push your fixes and the reviewer will be asked again.`);
      }
    }
  }

  /** A push to main that didn't come from a merged pull request is recorded as a rule exception. */
  async onPushToMain(push) {
    const pusher = (push.pusher && push.pusher.name) || (push.sender && push.sender.login) || 'unknown';
    if (/\[bot\]$/.test(pusher) || pusher === 'github-actions') return;
    const commits = (push.commits || []).filter((c) => c.distinct !== false);
    const direct = [];
    for (const c of commits) {
      const { data } = await this.github.rest.repos.listPullRequestsAssociatedWithCommit({ ...this.repo, commit_sha: c.id });
      if (!data.some((pr) => pr.merged_at)) direct.push(c);
    }
    if (!direct.length) return;
    const admin = await this.isAdmin(pusher);
    const list = direct.map((c) => `- [\`${c.id.slice(0, 7)}\`](${this.repoUrl}/commit/${c.id}) ${String(c.message).split('\n')[0]}`).join('\n');
    const { data: issue } = await this.github.rest.issues.create({
      ...this.repo,
      title: `Direct push to main by @${pusher} (${direct.length} commit${direct.length === 1 ? '' : 's'})`,
      labels: ['rule exception'],
      assignees: [pusher].filter((p) => p !== 'unknown'),
      body: [
        `🟠 **Rule exception recorded.** @${pusher} pushed to \`main\` without a pull request${admin ? ' (as a repository administrator)' : ''}:`,
        '',
        list,
        '',
        RULES.directPush,
        '',
        `@${pusher}: please reply with the reason (for example, the emergency it fixed), then close this issue. If it wasn’t intended, revert the commit through a ticket and pull request.`,
      ].join('\n'),
    });
    this.log(`recorded direct push as #${issue.number}`);
  }

  /** The "Review gate" check: green only when a reviewer named on the ticket approved. */
  async reviewGate(pr) {
    const issues = await this.issuesFor(pr);
    if (!issues.length) return { ok: false, message: 'Not linked to a ticket. Add "Closes #<number>" to the pull request description.' };
    const latest = await this.latestApprovals(pr);
    let exceptions = null; // looked up only when needed
    for (const issue of issues) {
      const reviewers = parseMeta(issue.body).reviewers.map(lc);
      const assignees = (issue.assignees || []).map((a) => lc(a.login));
      const eligible = reviewers.filter((r) => !assignees.includes(r)); // assignee ≠ reviewer
      const blocking = reviewers.filter((r) => latest[r] === 'CHANGES_REQUESTED');
      if (blocking.length) return { ok: false, message: `Changes requested by ${blocking.map((r) => '@' + r).join(', ')}.` };
      if (eligible.some((r) => latest[r] === 'APPROVED')) continue;
      exceptions ??= await this.validExceptions(pr, issues);
      if (exceptions.length) continue;
      if (!reviewers.length) return { ok: false, message: `Ticket #${issue.number} has no reviewer. Comment "/reviewer @name" on it.` };
      if (!eligible.length) {
        return { ok: false, message: `${reviewers.map((r) => '@' + r).join(', ')} is both assignee and reviewer of #${issue.number}. Add another reviewer, or record an exception with "/self-approve <reason>".` };
      }
      return { ok: false, message: `Waiting for approval from the reviewer of #${issue.number}: ${eligible.map((r) => '@' + r).join(', ')} (Approve button, or comment "/approve" on the pull request).` };
    }
    if (exceptions && exceptions.length) {
      const e = exceptions[exceptions.length - 1];
      return { ok: true, message: `Rule exception recorded by @${e.by}: ${e.reason}` };
    }
    return { ok: true, message: 'Approved by the ticket reviewer.' };
  }

  /**
   * Latest decision per person, from GitHub reviews and "/approve" comments together,
   * in time order. Approvals given before the latest commit become STALE_APPROVAL.
   */
  async latestApprovals(pr) {
    const headSha = pr.head && pr.head.sha;
    const reviews = await this.github.paginate(this.github.rest.pulls.listReviews, { ...this.repo, pull_number: pr.number, per_page: 100 });
    const comments = await this.github.paginate(this.github.rest.issues.listComments, { ...this.repo, issue_number: pr.number, per_page: 100 });
    let headTime = '';
    try {
      headTime = (await this.github.rest.repos.getCommit({ ...this.repo, ref: headSha })).data.commit.committer.date || '';
    } catch {
      /* unknown: don't mark comment approvals stale */
    }
    const events = [];
    reviews.forEach((r, i) => {
      if (!r.user || r.state === 'COMMENTED' || r.state === 'PENDING') return;
      const stale = headSha && r.commit_id && r.commit_id !== headSha;
      events.push({ login: lc(r.user.login), state: stale && r.state === 'APPROVED' ? 'STALE_APPROVAL' : r.state, at: r.submitted_at || '', seq: i });
    });
    comments.forEach((c, i) => {
      if (!c.user || /\[bot\]$/.test(c.user.login) || !parseCommands(c.body).some((x) => x.name === 'approve')) return;
      const stale = headTime && c.created_at && c.created_at < headTime;
      events.push({ login: lc(c.user.login), state: stale ? 'STALE_APPROVAL' : 'APPROVED', at: c.created_at || '', seq: 100_000 + i });
    });
    events.sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
    const latest = {};
    for (const e of events) latest[e.login] = e.state;
    return latest;
  }

  /** Scheduled: cards dragged on the board → labels and side effects; issues missing from the board → added. */
  async syncBoard() {
    await this.ensureLabels();
    if (!this.board) {
      this.log('Board sync skipped: set the PROJECT_TOKEN secret and PROJECT_NUMBER variable to enable it.');
      return;
    }
    const items = await this.board.items();
    const onBoard = new Set();
    for (const item of items) {
      if (!item.issueNumber || item.repo.toLowerCase() !== `${this.repo.owner}/${this.repo.repo}`.toLowerCase()) continue;
      onBoard.add(item.issueNumber);
      const issue = await this.getIssue(item.issueNumber);
      const labelStatus = statusOfLabels(issue.labels);
      const boardStatus = findStatus(item.status);
      if (!boardStatus) {
        await this.board.setStatus(issue.node_id, (labelStatus || byKey('icebox')).board);
      } else if (!labelStatus || labelStatus.key !== boardStatus.key) {
        this.log(`#${issue.number} was moved on the board to ${boardStatus.board}`);
        await this.setStatus(issue, boardStatus.key, { actor: issue.assignees && issue.assignees[0] && issue.assignees[0].login });
      }
    }
    const open = await this.github.paginate(this.github.rest.issues.listForRepo, { ...this.repo, state: 'open', per_page: 100 });
    for (const issue of open) {
      if (issue.pull_request || onBoard.has(issue.number)) continue;
      if ((issue.labels || []).some((l) => (l.name || l) === 'rule exception')) continue; // records, not tickets
      await this.board.add(issue.node_id);
      await this.board.setStatus(issue.node_id, (statusOfLabels(issue.labels) || byKey('icebox')).board);
      if (!statusOfLabels(issue.labels)) await this.setStatus(issue, 'icebox', { quiet: true });
    }
  }
}

// ------------------------------------------------------------------ Projects (v2) board

/**
 * The Kanban board. GitHub Projects belong to a user or organization, so the
 * workflow's built-in token can't reach them; a personal access token
 * (classic, scopes: repo + project) is stored as the PROJECT_TOKEN secret.
 */
class Board {
  constructor({ token, owner, number, fetchImpl }) {
    this.token = token;
    this.owner = owner;
    this.number = Number(number);
    this.fetch = fetchImpl || globalThis.fetch;
    this.project = null;
  }

  async gql(query, variables) {
    const res = await this.fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
    return json.data;
  }

  async load() {
    if (this.project) return this.project;
    const fields = `id title field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }`;
    const data = await this.gql(
      `query($login: String!, $number: Int!) {
        repositoryOwner(login: $login) {
          ... on User { projectV2(number: $number) { ${fields} } }
          ... on Organization { projectV2(number: $number) { ${fields} } }
        }
      }`,
      { login: this.owner, number: this.number },
    );
    const p = data.repositoryOwner && data.repositoryOwner.projectV2;
    if (!p) throw new Error(`Project #${this.number} not found for ${this.owner}`);
    if (!p.field) throw new Error(`Project "${p.title}" has no "Status" field`);
    this.project = { id: p.id, fieldId: p.field.id, options: p.field.options };
    return this.project;
  }

  async itemFor(contentId) {
    const p = await this.load();
    const data = await this.gql(
      `query($id: ID!) { node(id: $id) { ... on Issue { projectItems(first: 50) { nodes { id project { id } } } } } }`,
      { id: contentId },
    );
    const items = (data.node && data.node.projectItems && data.node.projectItems.nodes) || [];
    const found = items.find((i) => i.project.id === p.id);
    return found ? found.id : null;
  }

  async add(contentId) {
    const p = await this.load();
    const existing = await this.itemFor(contentId);
    if (existing) return existing;
    const data = await this.gql(
      `mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`,
      { project: p.id, content: contentId },
    );
    return data.addProjectV2ItemById.item.id;
  }

  async setStatus(contentId, statusName) {
    const p = await this.load();
    const option = p.options.find((o) => norm(o.name) === norm(statusName));
    if (!option) throw new Error(`The board's Status field has no "${statusName}" column (it has: ${p.options.map((o) => o.name).join(', ')})`);
    const itemId = await this.add(contentId);
    await this.gql(
      `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
      }`,
      { project: p.id, item: itemId, field: p.fieldId, option: option.id },
    );
  }

  async items() {
    const p = await this.load();
    const out = [];
    let after = null;
    do {
      const data = await this.gql(
        `query($id: ID!, $after: String) {
          node(id: $id) { ... on ProjectV2 { items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              content { ... on Issue { number repository { nameWithOwner } } }
              fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            }
          } } }
        }`,
        { id: p.id, after },
      );
      const page = data.node.items;
      for (const n of page.nodes) {
        out.push({
          issueNumber: n.content && n.content.number,
          repo: (n.content && n.content.repository && n.content.repository.nameWithOwner) || '',
          status: n.fieldValueByName && n.fieldValueByName.name,
        });
      }
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
    return out;
  }
}

// ------------------------------------------------------------------ entry points

function makeBot({ github, context, core, projectToken, projectNumber, fetchImpl }) {
  const board = projectToken && projectNumber ? new Board({ token: projectToken, owner: context.repo.owner, number: projectNumber, fetchImpl }) : null;
  return new TicketBot({ github, context, core, board });
}

/** Dispatch one workflow event. */
async function main(args) {
  const { context } = args;
  const bot = makeBot(args);
  const p = context.payload;
  const actor = (p.sender && p.sender.login) || context.actor;
  const isBot = /\[bot\]$/.test(actor || '');

  switch (context.eventName) {
    case 'issues':
      if (p.issue.pull_request) return;
      if (p.action === 'opened') return bot.onIssueOpened(p.issue);
      if (p.action === 'labeled' && !isBot) return bot.onIssueLabeled(p.issue, p.label.name, actor);
      return;
    case 'issue_comment':
      if (p.action === 'created' && !isBot) return bot.onIssueComment(p.issue, p.comment.body, actor);
      return;
    case 'pull_request':
      return bot.onPullRequest(p.pull_request, p.action);
    case 'push':
      if (context.ref === 'refs/heads/main') return bot.onPushToMain(p);
      return;
    case 'pull_request_review':
      if (p.action === 'submitted') return bot.onReview(p.pull_request, p.review);
      return;
    case 'schedule':
    case 'workflow_dispatch':
      return bot.syncBoard();
    default:
      bot.log(`Nothing to do for ${context.eventName}`);
  }
}

/** The "Review gate" required check. */
async function reviewGate(args) {
  const bot = makeBot({ ...args, projectToken: null });
  const pr = args.context.payload.pull_request;
  const result = await bot.reviewGate(pr);
  if (result.ok) args.core.info(`✅ ${result.message}`);
  else args.core.setFailed(result.message);
  return result;
}

module.exports = {
  main,
  RULES,
  reviewGate,
  TicketBot,
  Board,
  STATUSES,
  HELP,
  slugify,
  branchName,
  parseCommands,
  parseUsers,
  parseMeta,
  parseFormField,
  withMeta,
  linkedIssueNumbers,
  latestReviews,
  findStatus,
  statusOfLabels,
};
