import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { VisitorService } from '../../../lib/visitor/VisitorService';

/**
 * The questions you asked, and what the shops said back.
 *
 * THIS IS THE HALF THAT MAKES THE BUTTON WORTH PRESSING. An enquiry that goes
 * into a table nobody can read is a contact form on a dead address; the
 * feature is only real once the answer comes back to the person who asked, in
 * a place they can find it.
 *
 * WHAT IS VISIBLE IS ROW-LEVEL SECURITY'S DECISION, not a filter here. The
 * policy on `enquiries` is `user_id = auth.uid() or is_shop_member(shop_id)`,
 * so this asks for everything and gets exactly this visitor's conversations.
 * A filter in the query would be a second opinion about the same rule, and
 * the two would eventually disagree.
 */
const MyEnquiries = ({ userId }) => {
  const service = useMemo(() => new VisitorService(), []);

  const [threads, setThreads] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setThreads(await service.myEnquiries());
      setProblem(null);
    } catch (e) {
      setProblem(e.message);
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { load(); }, [load]);

  const open = async (thread) => {
    if (openId === thread.id) { setOpenId(null); return; }
    setOpenId(thread.id);
    setConversation([]);
    try {
      setConversation(await service.thread(thread.id));
    } catch (e) {
      setProblem(e.message);
    }
  };

  const send = async (thread) => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await service.followUp(thread.id, userId, draft);
      setDraft('');
      setConversation(await service.thread(thread.id));
      load();                       // the status went back to waiting
      setProblem(null);
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="luxe-sub">Loading your questions…</p>;

  if (!threads.length) {
    return (
      <p className="luxe-empty">
        You have not asked anything yet. Find something in the house and press
        Enquire — the shop&apos;s answer comes back here and by email.
      </p>
    );
  }

  return (
    <>
      {problem && <p className="luxe-note bad">{problem}</p>}
      <div className="luxe-feed">
        {threads.map((thread) => {
          const answered = thread.status === 'replied';
          const isOpen = openId === thread.id;
          return (
            <article
              key={thread.id}
              className={`ask-thread${answered ? ' answered' : ''}`}
            >
              <header className="ask-thread-head">
                <strong>{thread.product_name ?? 'General enquiry'}</strong>
                <span className={`ask-status ${thread.status}`}>
                  {answered ? 'answered' : thread.status === 'new' ? 'waiting' : thread.status}
                </span>
                <span className="ask-when">
                  {thread.shop_name} · {when(thread.created_at)}
                </span>
              </header>

              <div className="ask-bubbles">
                <div className="ask-bubble mine">
                  <span className="ask-bubble-who">You asked</span>
                  {thread.message}
                </div>

                {/* The latest answer, without opening anything. Most threads
                    are one question and one reply, and making somebody click
                    to read a single sentence is a click for nothing. */}
                {!isOpen && thread.last_reply && (
                  <div className="ask-bubble theirs">
                    <span className="ask-bubble-who">{thread.shop_name} replied</span>
                    {thread.last_reply}
                  </div>
                )}

                {isOpen && conversation.map((line) => (
                  <div
                    key={line.id}
                    className={`ask-bubble ${line.from_shop ? 'theirs' : 'mine'}`}
                  >
                    <span className="ask-bubble-who">
                      {line.from_shop ? `${thread.shop_name} replied` : 'You said'}
                      {' · '}{when(line.created_at)}
                    </span>
                    {line.body}
                  </div>
                ))}
              </div>

              <div className="ask-reply">
                {isOpen ? (
                  <>
                    <textarea
                      rows={2}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Reply to ${thread.shop_name}…`}
                    />
                    <button
                      type="button"
                      className="luxe-btn primary"
                      disabled={busy || !draft.trim()}
                      onClick={() => send(thread)}
                    >
                      {busy ? 'Sending…' : 'Send'}
                    </button>
                  </>
                ) : (
                  <button type="button" className="luxe-link" onClick={() => open(thread)}>
                    {thread.replies > 1
                      ? `Read all ${thread.replies} replies and answer`
                      : 'Open and reply'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
};

function when(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short',
  });
}

export default MyEnquiries;
