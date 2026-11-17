// /mind/program/:id?day=N — multi-day mental-skills track: lesson, exercise, tool (breathing / imagery / routine) and a journal prompt.
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { todayKey } from '../lib/calc';
import { crisisInText, defaultMindQuiz, JOURNAL_MAX, patternById, programProgress, type JournalEntry, type MindSession } from '../lib/mind';
import { programById, routineById } from '../data/mindContent';
import { Page, Card, Banner } from '../components/ui';
import { Icon } from '../components/Icon';
import { SrcPills } from '../components/SrcPills';
import { CrisisCard, NotTherapy } from '../components/MindBits';
import { useToast } from '../lib/toast';

export default function MindProgram() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const { data, profile, upsert, remove } = useStore();
  const toast = useToast();
  const prog = programById(id);
  const sessions = data.mindsessions as MindSession[];
  const pr = prog ? programProgress(sessions, prog.id, prog.days.length) : null;
  const dayN = Math.max(1, Math.min(prog?.days.length || 1, +(sp.get('day') || 0) || pr?.next || 1));
  const day = prog?.days[dayN - 1];
  const q = profile.mind?.quiz || defaultMindQuiz(profile);
  const priv = !!q.privateJournal;
  const [text, setText] = useState('');
  const [crisis, setCrisis] = useState(false);
  const [line, setLine] = useState(0);
  if (!prog || !day || !pr) return <Page title="Program" back="/mind?tab=skills"><p>Program not found.</p></Page>;
  const done = pr.done.has(dayN);
  const from = encodeURIComponent(`${prog.id}?day=${dayN}`);
  const go = (n: number) => { setSp({ day: String(n) }); setText(''); setCrisis(false); setLine(0); window.scrollTo?.(0, 0); };

  const complete = () => {
    if (text.trim()) {
      const j: Omit<JournalEntry, 'updatedAt'> = { id: uid(), date: todayKey(), kind: 'reflect', text: text.slice(0, JOURNAL_MAX), prompt: day.prompt, program: `${prog.id}:${dayN}`, ...(priv ? { localOnly: true } : {}) };
      upsert('journal', j as JournalEntry);
      if (crisisInText(text)) setCrisis(true);
    }
    if (!done) upsert<MindSession>('mindsessions', { id: uid(), date: todayKey(), kind: 'program', ref: `${prog.id}:${dayN}`, minutes: day.minutes });
    toast(dayN === prog.days.length ? `${prog.name} complete` : `Day ${dayN} done`);
    if (!crisisInText(text) && dayN < prog.days.length) go(dayN + 1);
    else setText('');
  };
  const undo = () => { sessions.filter((s) => !s.deleted && s.kind === 'program' && s.ref === `${prog.id}:${dayN}`).forEach((s) => remove('mindsessions', s.id)); };

  return <Page title={prog.name} kicker={`Mind · Day ${dayN} of ${prog.days.length} · ${pr.pct}% done`} back="/mind?tab=skills">
    <div className="stack sl-root mn-root" data-testid="mind-program">
      <div className="mn-days" role="tablist" aria-label="Days">{prog.days.map((d) => <button key={d.day} role="tab" aria-selected={d.day === dayN} className={`${d.day === dayN ? 'on' : ''} ${pr.done.has(d.day) ? 'done' : ''}`} onClick={() => go(d.day)} aria-label={`Day ${d.day}${pr.done.has(d.day) ? ', done' : ''}`}>{pr.done.has(d.day) ? <Icon name="check" size={14} /> : d.day}</button>)}</div>
      {crisis && <CrisisCard title="Thank you for writing that down. Please reach out now." minor={q.age < 18} />}
      <Card className="wl-hero">
        <div className="kicker">Day {dayN} · about {day.minutes} min</div>
        <h2 className="fast-h" style={{ margin: '4px 0 8px' }}>{day.title}</h2>
        <p style={{ marginTop: 0, lineHeight: 1.55 }}>{day.lesson}</p>
        <SrcPills ids={day.src} />
      </Card>
      <Card>
        <h3>Today’s exercise</h3>
        <ol className="mn-steps">{day.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {day.tool?.kind === 'breathe' && <Link className="btn y" to={`/mind/breathe/${day.tool.pattern}?min=${day.tool.minutes}&from=${from}`} data-testid="mind-prog-tool"><Icon name="mind" size={18} />{patternById(day.tool.pattern)?.name} · {day.tool.minutes} min</Link>}
        {day.tool?.kind === 'routine' && <Link className="btn y" to={`/mind/routine/${day.tool.id}?from=${from}`}><Icon name="timer" size={18} />{routineById(day.tool.id)?.name}</Link>}
        {day.tool?.kind === 'imagery' && <div className="mn-imagery" data-testid="mind-imagery">
          <div className="kicker">Script · {line + 1} of {day.tool.lines.length}</div>
          <p aria-live="polite">{day.tool.lines[line]}</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" disabled={line === 0} onClick={() => setLine(line - 1)}><Icon name="back" size={14} />Back</button>
            <button className="btn sm y" disabled={line >= day.tool.lines.length - 1} onClick={() => setLine(line + 1)}>Next<Icon name="chevron" size={14} /></button>
          </div>
          <p className="muted small" style={{ margin: '8px 0 0' }}>Read a line, close your eyes, and play it in your head for 20–30 seconds before moving on.</p>
        </div>}
      </Card>
      <Card>
        <h3>Write it down</h3>
        <label className="field"><span>{day.prompt}</span><textarea rows={4} maxLength={JOURNAL_MAX} value={text} onChange={(e) => setText(e.target.value)} data-testid="mind-prog-text" placeholder="A few words is enough…" /></label>
        <p className="muted small" style={{ margin: '4px 0 10px' }}><Icon name="lock" size={12} /> Saved to your private journal{priv ? ' — on this device only.' : '.'} Optional.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn y" data-testid="mind-prog-done" onClick={complete}><Icon name="check" size={16} />{done ? (text.trim() ? 'Save note' : 'Done') : `Complete day ${dayN}`}</button>
          {done && <button className="btn ghost sm" onClick={undo}>Mark not done</button>}
          {dayN < prog.days.length && <button className="btn ghost sm" onClick={() => go(dayN + 1)}>Skip to day {dayN + 1}</button>}
        </div>
      </Card>
      {pr.next === null && <Banner tone="ok"><b>Program complete.</b> Revisit any day whenever you need it — the tools are yours now.</Banner>}
      <CrisisCard compact />
      <NotTherapy />
    </div>
  </Page>;
}
