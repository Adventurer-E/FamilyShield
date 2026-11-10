import { useState } from 'react';
import { formatMoney } from '@familyshield/core';
import type { Person } from '@familyshield/core';
import { useFs } from '../context';
import { Avatar, Button, DemoHint, Notice, Screen } from '../kit';

/**
 * Trusted circle: the people a new request goes to. List them, add someone,
 * change a nickname, or remove someone (with a confirmation). Every rule
 * (not yourself, not twice, nickname length…) is checked by the back-end;
 * its message shows at the top of the screen.
 */
export function Circle() {
  const { api, data, run } = useFs();
  const { circle, me, people } = data.profile;

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [newId, setNewId] = useState('');
  const [newNickname, setNewNickname] = useState('');

  // People I can already see a name for (e.g. a relative who asked me) but who aren't in my circle.
  const suggestions = people.filter((p) => p.id !== me.id && !circle.some((c) => c.id === p.id));

  const startRename = (p: Person) => {
    setRemoving(null);
    setEditing(p.id);
    setDraft(p.nickname ?? '');
  };

  const saveRename = async (id: string) => {
    if (await run(() => api.renameCircleMember(id, draft))) setEditing(null);
  };

  const remove = async (id: string) => {
    if (await run(() => api.removeCircleMember(id))) setRemoving(null);
  };

  const add = async () => {
    const id = newId.trim().toLowerCase();
    const nickname = newNickname.trim();
    const result = await run(() => api.addCircleMember(id, nickname || undefined));
    if (result) {
      setNewId('');
      setNewNickname('');
    }
  };

  return (
    <Screen title="Trusted circle">
      <p className="fs-small fs-muted" style={{ margin: 0 }}>
        When you ask for help, your request goes privately to everyone in your circle at that moment.
      </p>

      <h2 className="fs-section-title">In your circle · {circle.length}</h2>
      {circle.length === 0 ? (
        <section className="fs-card">
          <div className="fs-small fs-muted">Nobody yet. Add someone below so you have family to ask when you need help.</div>
        </section>
      ) : (
        <div className="fs-card flush">
          {circle.map((p, i) => (
            <Member
              key={p.id}
              first={i === 0}
              person={p}
              editing={editing === p.id}
              removing={removing === p.id}
              draft={draft}
              onDraft={setDraft}
              onRename={() => startRename(p)}
              onSave={() => void saveRename(p.id)}
              onCancel={() => {
                setEditing(null);
                setRemoving(null);
              }}
              onAskRemove={() => {
                setEditing(null);
                setRemoving(p.id);
              }}
              onRemove={() => void remove(p.id)}
            />
          ))}
        </div>
      )}

      <h2 className="fs-section-title">Add someone</h2>
      <section className="fs-card">
        {suggestions.length > 0 ? (
          <div className="fs-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((p) => (
              <Button key={p.id} variant="secondary" small pressed={newId === p.id} onClick={() => setNewId(p.id)}>
                {p.firstName} {p.lastName}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="fs-field">
          <label htmlFor="fs-circle-id">Their FamilyShield ID</label>
          <input
            id="fs-circle-id"
            className="fs-input"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="fs-field">
          <label htmlFor="fs-circle-nickname">
            What you call them <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>· optional</span>
          </label>
          <input
            id="fs-circle-nickname"
            className="fs-input"
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            placeholder="e.g. Aunt Lisa"
          />
        </div>
        <Button onClick={() => void add()} disabled={!newId.trim()}>
          Add to circle
        </Button>
        <DemoHint>
          IDs are the <code>id</code> column of <code>data/people.csv</code> (for example <code>alex</code>, <code>mom</code>, <code>maya</code>,{' '}
          <code>lisa</code>). A real bank would let you pick from your contacts instead.
        </DemoHint>
      </section>

      <Notice>Only you see your circle and the nicknames you give people.</Notice>
    </Screen>
  );
}

function Member(props: {
  first: boolean;
  person: Person;
  editing: boolean;
  removing: boolean;
  draft: string;
  onDraft(value: string): void;
  onRename(): void;
  onSave(): void;
  onCancel(): void;
  onAskRemove(): void;
  onRemove(): void;
}) {
  const { data } = useFs();
  const p = props.person;
  const full = `${p.firstName} ${p.lastName}`;
  const shown = p.nickname ?? p.firstName;

  // What removing them changes, in plain words. Mirrors withdrawMember in packages/core/src/loan.ts.
  const loan = data.myLoan;
  const offer = loan?.status === 'collecting' ? loan.offers.find((o) => o.memberId === p.id) : undefined;
  let consequence = 'Your future requests won’t go to them.';
  if (offer?.status === 'offered') consequence += ` Their offer of ${formatMoney(offer.amount)} on your open request will be withdrawn.`;
  else if (offer?.status === 'pending') consequence += ' They won’t be able to answer your open request.';
  if (loan && (loan.status === 'signing' || loan.status === 'active') && loan.agreements.some((a) => a.lenderId === p.id)) {
    consequence += ' Agreements you’ve already signed with them stay as they are.';
  }

  return (
    <div className="fs-stack" style={{ padding: '14px 16px', borderTop: props.first ? undefined : '1px solid var(--fs-line)' }}>
      <div className="fs-row">
        <Avatar id={p.id} />
        <div className="fs-grow">
          <div style={{ fontWeight: 800 }}>{shown}</div>
          {p.nickname ? <div className="fs-small fs-muted">{full}</div> : null}
        </div>
        {!props.editing && !props.removing ? (
          <>
            <Button variant="secondary" small onClick={props.onRename}>
              Rename
            </Button>
            <Button variant="ghost" small onClick={props.onAskRemove}>
              Remove
            </Button>
          </>
        ) : null}
      </div>

      {props.editing ? (
        <>
          <div className="fs-field">
            <label htmlFor={`fs-nick-${p.id}`}>What you call {p.firstName}</label>
            <input
              id={`fs-nick-${p.id}`}
              className="fs-input"
              value={props.draft}
              onChange={(e) => props.onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') props.onSave();
                if (e.key === 'Escape') props.onCancel();
              }}
              placeholder={p.firstName}
              autoFocus
            />
            <span className="fs-tiny fs-muted">Leave it empty to just use {p.firstName}.</span>
          </div>
          <div className="fs-grid-2">
            <Button variant="secondary" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button onClick={props.onSave}>Save</Button>
          </div>
        </>
      ) : null}

      {props.removing ? (
        <div className="fs-card outline" role="alertdialog" aria-labelledby={`fs-rm-${p.id}`}>
          <div id={`fs-rm-${p.id}`} style={{ fontWeight: 800 }}>
            Remove {shown} from your circle?
          </div>
          <div className="fs-small fs-muted">{consequence}</div>
          <div className="fs-grid-2">
            <Button variant="secondary" onClick={props.onCancel}>
              Keep
            </Button>
            <Button variant="dark" onClick={props.onRemove}>
              Remove
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
