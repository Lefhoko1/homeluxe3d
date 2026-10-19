import React, { useState } from 'react';

import { Async, Button, Panel, Pill, Search, useAsync, useFilter, when } from '../ui';

/**
 * Questions from customers, and answering them.
 *
 * THE END OF THE FUNNEL, and until now it was a dead end. "Enquire at Tubod
 * Enterprises" recorded an analytics event and wrote nothing: `enquiries` sat
 * empty for fifteen migrations, and `status` could be set to 'replied' with
 * nowhere to put the reply -- a shop could mark a question answered without
 * answering it, and the customer would never see a word.
 *
 * Replying here writes to the thread, moves the enquiry to 'replied' by
 * trigger, and tells the customer twice: a notification in the app and an
 * email through the same outbox the product announcements use.
 *
 * WHO SEES WHAT IS THE DATABASE'S DECISION. The policy on `enquiries` is
 * `is_shop_member(shop_id) or user_id = auth.uid()`, so a shop manager opens
 * this and sees their own shop's questions without asking for them, and a
 * platform admin sees all of them.
 */
const Enquiries = ({ data, me, canManage }) => {
  const threads = useAsync(() => data.enquiryThreads(), [data]);
  const [openId, setOpenId] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [onlyWaiting, setOnlyWaiting] = useState(false);

  const rows = (threads.data ?? []).filter(
    (t) => !onlyWaiting || t.status === 'new' || t.status === 'seen'
  );
  const { term, setTerm, filtered } = useFilter(rows, [
    'from_name', 'product_name', 'shop_name', 'message',
  ]);

  const open = async (thread) => {
    if (openId === thread.id) { setOpenId(null); return; }
    setOpenId(thread.id);
    setConversation([]);
    setDraft('');
    try {
      setConversation(await data.enquiryThread(thread.id));
      setProblem(null);
    } catch (e) {
      setProblem(e.message);
    }
  };

  const reply = async (thread) => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await data.replyToEnquiry(thread.id, me, draft);
      setDraft('');
      setConversation(await data.enquiryThread(thread.id));
      threads.refresh();
      setProblem(null);
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  const waiting = (threads.data ?? []).filter(
    (t) => t.status === 'new' || t.status === 'seen'
  ).length;

  return (
    <Panel
      title="Enquiries"
      subtitle={
        waiting
          ? `${waiting} question${waiting === 1 ? '' : 's'} waiting for an answer. The customer is told in the app and by email when you reply.`
          : 'Questions from customers about what is in the house.'
      }
      actions={
        <>
          <Search value={term} onChange={setTerm} placeholder="Search questions…" />
          <label className="ad-check">
            <input
              type="checkbox"
              checked={onlyWaiting}
              onChange={(e) => setOnlyWaiting(e.target.checked)}
            />
            Only unanswered
          </label>
        </>
      }
    >
      {problem && <p className="ad-note bad">{problem}</p>}

      <Async
        state={threads}
        empty="No questions yet. The Enquire button on a product writes one."
      >
        {() => (
          <div className="ad-assets">
            {filtered.map((thread) => {
              const isOpen = openId === thread.id;
              const answered = thread.status === 'replied';
              return (
                <article key={thread.id} className="ad-asset">
                  <header className="ad-enquiry-head">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{thread.from_name || 'A customer'}</strong>
                      <Pill tone={answered ? 'good' : 'warn'}>
                        {answered ? 'answered' : 'waiting'}
                      </Pill>
                      <div className="ad-dim">
                        {thread.product_name ?? 'General'} · {thread.shop_name}
                        {' · '}{when(thread.created_at)}
                      </div>
                      {/* HOW TO REACH THEM, if the answer is easier by phone.
                          The address is their account's; the number is only
                          there if they chose to give one. */}
                      <div className="ad-dim">
                        {thread.email || '—'}
                        {thread.phone ? ` · ${thread.phone}` : ''}
                      </div>
                    </div>
                    {canManage && (
                      <Button onClick={() => open(thread)}>
                        {isOpen ? 'Close' : answered ? 'Read' : 'Answer'}
                      </Button>
                    )}
                  </header>

                  <p className="ad-enquiry-message">{thread.message}</p>

                  {!isOpen && thread.last_reply && (
                    <p className="ad-enquiry-reply">
                      <span className="ad-dim">Your last reply · {when(thread.last_reply_at)}</span>
                      <br />
                      {thread.last_reply}
                    </p>
                  )}

                  {isOpen && (
                    <>
                      {conversation.map((line) => (
                        <p
                          key={line.id}
                          className={line.from_shop ? 'ad-enquiry-reply' : 'ad-enquiry-message'}
                        >
                          <span className="ad-dim">
                            {line.from_shop
                              ? `${line.profiles?.display_name ?? 'You'} · ${when(line.created_at)}`
                              : `${thread.from_name || 'The customer'} · ${when(line.created_at)}`}
                          </span>
                          <br />
                          {line.body}
                        </p>
                      ))}

                      {canManage && (
                        <div className="ad-enquiry-compose">
                          <textarea
                            rows={3}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder={`Answer ${thread.from_name || 'the customer'}…`}
                          />
                          <Button
                            tone="primary"
                            disabled={busy || !draft.trim()}
                            onClick={() => reply(thread)}
                          >
                            {busy ? 'Sending…' : 'Send the answer'}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Async>
    </Panel>
  );
};

export default Enquiries;
