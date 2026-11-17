// /mind/help — crisis & support page. Reachable from every Mind screen, Home and Me. No sign-in, works offline (tel:/sms: links).
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Page, Card } from '../components/ui';
import { CrisisCard, NotTherapy } from '../components/MindBits';
import { SrcPills } from '../components/SrcPills';
import { RED_FLAGS } from '../lib/mind';

const SIGNS = [
  'Talking about wanting to die, or about being a burden to others',
  'Feeling hopeless, trapped, empty, or in unbearable pain',
  'Withdrawing from friends, training partners or things you used to enjoy',
  'Big changes in sleep or eating, or drinking / using drugs more',
  'Taking dangerous risks, giving things away, or saying goodbye',
  'Extreme mood swings',
];
const HELP = [
  ['Ask', 'Ask directly: “Are you thinking about suicide?” Asking does not put the idea in someone’s head.'],
  ['Keep them safe', 'If they’re in immediate danger, call 911 (or local emergency services) and stay with them. Help put distance between them and anything they could use to hurt themselves.'],
  ['Be there', 'Listen without judging. You don’t need the right words.'],
  ['Help them connect', 'Call or text 988 together. Encourage them to see a doctor or counselor.'],
  ['Follow up', 'Check in over the next days. It makes a difference.'],
];

export default function MindHelp() {
  const { profile } = useStore();
  const minor = (profile.mind?.quiz.age ?? profile.age ?? 30) < 18;
  return <Page title="Get help now" kicker="Mind & Recovery · Support" back="/mind">
    <div className="stack sl-root mn-root" data-testid="mind-help">
      <CrisisCard minor={minor} />
      <Card>
        <h3>Warning signs to take seriously</h3>
        <p className="muted small" style={{ marginTop: 0 }}>In yourself or a teammate — especially if they’re new, getting worse, or linked to a loss or setback (injury, deselection, a bad race).</p>
        <ul className="cues">{SIGNS.map((s) => <li key={s}>{s}</li>)}</ul>
        <SrcPills ids={['mind-nimh-warning']} />
      </Card>
      <Card>
        <h3>How to help someone else</h3>
        <ol className="mn-steps">{HELP.map(([t, d]) => <li key={t}><b>{t}.</b> {d}</li>)}</ol>
        <SrcPills ids={['mind-nimh-suicide', 'mind-dazzi', 'mind-988']} />
      </Card>
      <Card>
        <h3>Not in crisis, but not OK?</h3>
        <ul className="cues">
          <li>If low mood, worry or poor sleep has lasted <b>2 weeks or more</b>, or gets in the way of training, work or school, talk to {minor ? 'a parent, school counselor or your doctor' : 'your doctor or a licensed mental-health professional'}.</li>
          <li>Many sports teams, colleges and governing bodies have confidential mental-health support — ask your coach or club.</li>
          <li>Mental health is part of performance. The IOC recommends athletes get the same support for it as for injuries.</li>
        </ul>
        <SrcPills ids={['mind-nimh-caring', 'mind-ioc-mh', 'mind-gulliver', ...(minor ? ['mind-nimh-teens'] : [])]} />
      </Card>
      <Card>
        <h3>Physical red flags — stop and see a clinician</h3>
        <ul className="mn-flags">{RED_FLAGS.map((f) => <li key={f.v} className={f.emergency ? 'em' : ''}><b>{f.label}</b><span>{f.action}</span></li>)}</ul>
        <SrcPills ids={Array.from(new Set(RED_FLAGS.flatMap((f) => f.src)))} />
      </Card>
      <Link className="btn block" to="/mind">Back to Mind & Recovery</Link>
      <NotTherapy />
    </div>
  </Page>;
}
