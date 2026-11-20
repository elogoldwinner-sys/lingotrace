import { useEffect, useMemo, useRef, useState } from 'react';
import { levelInfo } from '../avatar/level';
import * as api from './api';
import { useMq } from './context';
import { MonsterArt } from './art/MonsterArt';
import { Orb } from './art/Orb';
import { animClassFor } from './world/monsterSprites';
import './world/monsterAnimations.css';
import { QuestionView, formatCorrectAnswer } from './QuestionView';
import { EncounterScene, type SceneKind } from './scene/EncounterScene';
import { sfx } from './sound';
import { Bar, GameButton, RarityBadge, TypeBadge } from './ui';
import type { AnswerResult, Encounter, Question, ThrowResult } from './types';

type Phase = 'intro' | 'loading' | 'question' | 'feedback' | 'throw' | 'flying' | 'caught' | 'escaped';
type Fly = 'fly' | 'absorb' | 'wobble' | 'pop' | null;
interface Float { id: number; text: string; tone: string }

/** Run away: painted button (public/monster-quest/world/ui/btn-run.png) with the old pill as fallback. R twice (within 2 s) runs, so a stray key press never ends a capture. */
function RunButton({ busy, onRun }: { busy: boolean; onRun: () => void }) {
  const [img, setImg] = useState(true), [armed, setArmed] = useState(false);
  const run = useRef(onRun); run.current = onRun;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'r' && e.key !== 'R') return;
      if (busy) return;
      if (armed) { clearTimeout(timer.current); setArmed(false); run.current(); }
      else { sfx.click(); setArmed(true); clearTimeout(timer.current); timer.current = setTimeout(() => setArmed(false), 2000); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [armed, busy]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!img) return <button onClick={onRun} disabled={busy} className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/30">🏃 {armed ? 'Press R again' : 'Run away'} <kbd className="mq-run-key-plain">R</kbd></button>;
  return (
    <button className={`mq-runbtn ${armed ? 'armed' : ''}`} onClick={onRun} disabled={busy} aria-keyshortcuts="R" title="Run away (press R twice)">
      <img className="mq-runbtn-art" src={`${import.meta.env.BASE_URL}monster-quest/world/ui/btn-run.png`} alt="" draggable={false} onError={() => setImg(false)} />
      <i className="mq-runbtn-label">{armed ? 'Press R again' : 'Run away'}</i>
      <kbd className="mq-act-key">R</kbd>
    </button>
  );
}

export function EncounterModal({ encounter, onClose, scene }: { encounter: Encounter; onClose: (goTo?: 'monsters') => void; /** painted backdrop of the place the encounter started in */ scene?: SceneKind | null }) {
  const mq = useMq();
  const sp = mq.speciesById.get(encounter.species_id)!;
  const startLevel = useRef(levelInfo(mq.state.xp).level).current;
  const [phase, setPhase] = useState<Phase>('intro');
  const [q, setQ] = useState<Question | null>(null);
  const [res, setRes] = useState<AnswerResult | null>(null);
  const [meter, setMeter] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fly, setFly] = useState<Fly>(null);
  const [note, setNote] = useState<string | null>(null);
  const [won, setWon] = useState<ThrowResult | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [shake, setShake] = useState(false);
  const fid = useRef(0);
  const ended = useRef(false);

  const balls = useMemo(() => mq.items.filter((i) => i.kind === 'ball'), [mq.items]);
  const need = encounter.required_correct;
  const canThrow = correct >= need;
  const spriteSize = typeof window !== 'undefined' && window.innerWidth < 480 ? 130 : 170;

  const alive = useRef(false);
  useEffect(() => { sfx.encounter(); }, []);
  // leaving mid-encounter (navigating away): tell the server it is over. The alive flag keeps React
  // StrictMode's simulated unmount from ending a fresh encounter.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.setTimeout(() => { if (!alive.current && !ended.current) void api.flee(encounter.id).catch(() => undefined); }, 50);
    };
  }, [encounter.id]);

  const pop = (text: string, tone: string) => {
    const id = ++fid.current;
    setFloats((f) => [...f, { id, text, tone }]);
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400);
  };
  const guard = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError((e as Error).message); return null; } finally { setBusy(false); }
  };

  const loadQuestion = async () => {
    setPhase('loading'); setRes(null);
    const nq = await guard(() => api.nextQuestion(encounter.id));
    if (nq) { setQ(nq); setPhase('question'); } else setPhase(canThrow ? 'throw' : 'intro');
  };

  const submit = async (answer: unknown) => {
    const r = await guard(() => api.answerQuestion(encounter.id, answer));
    if (!r) { setPhase('intro'); return; }
    setRes(r); setMeter(r.meter); setCorrect(r.correct_count); setWrong(r.wrong_count); setStreak(r.streak);
    const xp = mq.state.xp + r.xp;
    mq.setState({ ...mq.state, xp, level: levelInfo(xp).level, coins: mq.state.coins + r.coins });
    if (r.correct) { sfx.correct(); pop(`+${r.xp} XP`, '#facc15'); if (r.coins) window.setTimeout(() => pop(`+${r.coins} 🪙`, '#fde68a'), 250); }
    else { sfx.wrong(); setShake(true); window.setTimeout(() => setShake(false), 500); }
    setPhase('feedback');
  };

  const finish = async (goTo?: 'monsters') => {
    ended.current = true;
    await mq.refresh().catch(() => undefined);
    onClose(goTo);
  };
  const run = async () => { ended.current = true; await api.flee(encounter.id).catch(() => undefined); await finish(); };

  const doThrow = async (ballKey: string) => {
    setError(null); setNote(null); setPhase('flying'); setFly('fly'); sfx.throw();
    const started = Date.now();
    let result: ThrowResult | null = null; let err: string | null = null;
    const call = api.throwBall(encounter.id, ballKey).then((r) => { result = r; }).catch((e: Error) => { err = e.message; });
    await new Promise((r) => setTimeout(r, 650));
    setFly('absorb');
    await new Promise((r) => setTimeout(r, 450));
    setFly('wobble');
    await call;
    if (err) { setFly(null); setError(err); setPhase('throw'); return; }
    const r = result as ThrowResult | null;
    if (!r) { setFly(null); setPhase('throw'); return; }
    for (let i = 0; i < 3; i++) { sfx.wobble(); await new Promise((res2) => setTimeout(res2, 480)); }
    const left = 2500 - (Date.now() - started); if (left > 0) await new Promise((res2) => setTimeout(res2, left));
    if (r.success) {
      setFly(null); setWon(r); sfx.capture(); ended.current = true;
      const xp = mq.state.xp + (r.xp ?? 0);
      mq.setState({ ...mq.state, xp, level: levelInfo(xp).level, coins: mq.state.coins + (r.coins ?? 0) });
      setPhase('caught');
    } else {
      setFly('pop'); sfx.escape();
      await new Promise((res2) => setTimeout(res2, 500));
      setFly(null);
      if (r.escaped) { ended.current = true; setPhase('escaped'); setNote(`${sp.name} broke free and ran away!`); }
      else { setMeter(r.meter ?? 0); setNote(`${sp.name} broke out of the orb! Its guard is back up a little.`); setPhase('throw'); }
    }
    const inv = { ...mq.state.inventory, [ballKey]: Math.max(0, (mq.state.inventory[ballKey] ?? 0) - 1) };
    mq.setState({ ...mq.state, inventory: inv });
  };

  const levelUp = levelInfo(mq.state.xp).level > startLevel;
  const showMonster = phase !== 'caught';
  const monsterAnim = fly === 'absorb' || fly === 'wobble' ? 'none' : shake ? 'hit' : 'idle';

  return (
    <div className="mq-encounter" role="dialog" aria-modal="true" aria-label={`Wild ${sp.name}`}>
      {scene ? <EncounterScene kind={scene} /> : <div className="mq-enc-sky" />}
      <div className="relative z-10 mx-auto flex h-full w-full max-w-2xl flex-col px-3 pb-4 pt-3 sm:px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="mq-nameplate">
            <div className="flex flex-wrap items-center gap-1.5"><span className="font-display text-lg font-extrabold text-white">{sp.name}</span><span className="text-sm font-bold text-white/80">Lv. {encounter.level}</span></div>
            <div className="mt-1 flex items-center gap-1.5"><TypeBadge type={sp.type} small /><RarityBadge rarity={sp.rarity} /></div>
          </div>
          {phase !== 'caught' && phase !== 'escaped' && phase !== 'flying' && (
            <RunButton busy={busy} onRun={run} />
          )}
        </div>

        {phase !== 'caught' && (
          <div className="mt-2 grid gap-2 rounded-2xl bg-black/25 p-2.5 text-white">
            <div className="flex items-center gap-2 text-xs font-extrabold"><span className="w-24 shrink-0">Capture power</span><Bar pct={meter} color="linear-gradient(90deg,#22c55e,#facc15)" label="Capture power" /><span className="w-9 text-right tabular-nums">{meter}%</span></div>
            <div className="flex items-center justify-between text-xs font-bold text-white/85">
              <span>Correct: {Math.min(correct, need)}/{need} needed to throw</span>
              <span>{'❤️'.repeat(Math.max(0, 3 - wrong))}{'🖤'.repeat(Math.min(3, wrong))}</span>
              {streak > 1 && <span className="text-yellow-300">🔥 {streak} streak</span>}
            </div>
          </div>
        )}

        <div className="relative mt-2 flex min-h-[190px] flex-1 items-center justify-center">
          {showMonster && (
            <div className={`mq-stage-monster ${fly === 'absorb' ? 'is-absorb' : ''} ${fly === 'wobble' ? 'is-hidden' : ''} ${phase === 'escaped' ? 'is-gone' : ''}`}>
              {/* the supplied keyframe animation plays while the monster is idle; hit / absorb keep their own effects */}
              <div className={monsterAnim === 'idle' ? animClassFor(sp.id, sp.type) : undefined} style={{ display: 'inline-block', lineHeight: 0 }}>
                <MonsterArt spec={sp.art} spriteUrl={sp.sprite_url} size={spriteSize} flip anim={monsterAnim === 'idle' ? 'none' : monsterAnim} />
              </div>
            </div>
          )}
          {(fly === 'fly' || fly === 'absorb') && <div className="mq-orb-fly"><Orb size={44} color={(balls[0] && mq.itemsByKey.get(balls[0].key)?.color) || '#3b82f6'} /></div>}
          {(fly === 'wobble' || fly === 'pop') && <div className={`mq-orb-land ${fly === 'wobble' ? 'is-wobble' : 'is-pop'}`}><Orb size={60} color={(balls[0] && mq.itemsByKey.get(balls[0].key)?.color) || '#3b82f6'} /></div>}
          <div className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center gap-1">
            {floats.map((f) => <span key={f.id} className="mq-float" style={{ color: f.tone }}>{f.text}</span>)}
          </div>
        </div>

        <div className="mt-2">
          {error && <p className="mb-2 rounded-xl bg-red-500/90 px-3 py-2 text-center text-sm font-bold text-white" role="alert">{error}</p>}

          {phase === 'intro' && (
            <div className="mq-card text-center">
              <p className="font-bold text-[#10285a]">A wild {sp.name} appeared!</p>
              <p className="mt-1 text-sm text-[#3d5a94]">{sp.description}</p>
              <p className="mt-2 text-sm font-semibold text-[#1d3b6e]">Answer {need} question{need > 1 ? 's' : ''} correctly, then throw an orb. Three wrong answers and it runs off!</p>
              <GameButton className="mt-3 w-full" tone="green" onClick={loadQuestion} disabled={busy}>{correct > 0 ? 'Next question' : 'Start capture challenge'}</GameButton>
            </div>
          )}
          {phase === 'loading' && <p className="py-6 text-center font-bold text-white">Thinking of a question…</p>}
          {phase === 'question' && q && <QuestionView key={q.id} q={q} busy={busy} onSubmit={submit} />}

          {phase === 'feedback' && res && q && (
            <div className={`mq-card ${res.correct ? 'mq-card-good' : 'mq-card-bad'}`} aria-live="polite">
              <p className="text-lg font-extrabold">{res.correct ? (res.streak > 1 ? `Correct! ${res.streak} in a row! 🔥` : 'Correct! ✅') : res.late ? 'Too slow! ⏱' : 'Not quite ❌'}</p>
              {!res.correct && <p className="mt-1 text-sm font-semibold">Answer: <span className="font-extrabold">{formatCorrectAnswer(q.type, res.correct_answer)}</span></p>}
              {res.explanation && <p className="mt-1 text-sm">{res.explanation}</p>}
              {res.correct && res.xp === 0 && <p className="mt-1 text-xs font-semibold opacity-80">Daily XP limit reached. You still earned coins and capture power!</p>}
              {levelUp && <p className="mt-1 text-sm font-extrabold text-amber-600">⭐ Level up! You are now level {levelInfo(mq.state.xp).level}.</p>}
              <div className="mt-3 flex gap-2">
                {res.escaped ? (
                  <GameButton className="flex-1" tone="red" onClick={() => { ended.current = true; setPhase('escaped'); setNote(`${sp.name} got bored and ran away!`); }}>Continue</GameButton>
                ) : (<>
                  {res.can_throw && <GameButton className="flex-1" tone="gold" onClick={() => setPhase('throw')}>Throw an orb!</GameButton>}
                  <GameButton className="flex-1" tone={res.can_throw ? 'blue' : 'green'} onClick={loadQuestion}>{res.can_throw ? 'Answer more' : 'Next question'}</GameButton>
                </>)}
              </div>
            </div>
          )}

          {phase === 'throw' && (
            <div className="mq-card">
              <p className="text-center font-extrabold text-[#10285a]">Choose an orb</p>
              {note && <p className="mt-1 text-center text-sm font-semibold text-[#c2410c]">{note}</p>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                {balls.map((b) => {
                  const have = mq.state.inventory[b.key] ?? 0;
                  return (
                    <button key={b.key} type="button" disabled={have < 1 || busy} onClick={() => doThrow(b.key)} className="mq-ball-pick">
                      <Orb size={38} color={b.color} /><span className="text-left"><span className="block text-sm font-extrabold">{b.name}</span><span className="block text-[11px] font-semibold opacity-70">x{b.catch_multiplier} · you have {have}</span></span>
                    </button>
                  );
                })}
              </div>
              {balls.every((b) => (mq.state.inventory[b.key] ?? 0) < 1) && <p className="mt-2 text-center text-sm font-bold text-red-600">No orbs left! Run away, then buy more in the Shop.</p>}
              <GameButton className="mt-2 w-full" tone="blue" onClick={loadQuestion} disabled={busy}>Answer another question first (more power)</GameButton>
            </div>
          )}
          {phase === 'flying' && <p className="py-4 text-center text-lg font-extrabold text-white">…</p>}

          {phase === 'escaped' && (
            <div className="mq-card text-center">
              <p className="text-xl font-extrabold text-[#10285a]">💨 It got away!</p>
              <p className="mt-1 text-sm text-[#3d5a94]">{note ?? `${sp.name} ran off.`} Every question you answered still earned XP.</p>
              <GameButton className="mt-3 w-full" tone="blue" onClick={() => finish()}>Back to exploring</GameButton>
            </div>
          )}
        </div>
      </div>

      {phase === 'caught' && won && (
        <div className="mq-caught">
          <div className="mq-burst" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <span key={i} style={{ ['--a' as string]: `${(i / 22) * 360}deg`, ['--d' as string]: `${90 + (i % 5) * 30}px`, ['--c' as string]: ['#facc15', '#38bdf8', '#f472b6', '#4ade80'][i % 4] }} />)}</div>
          <div className="relative z-10 w-full max-w-md px-4 text-center">
            <p className="font-display text-3xl font-extrabold text-yellow-300 drop-shadow">Gotcha!</p>
            <div className="my-2 flex justify-center"><div className={animClassFor(sp.id, sp.type)} style={{ display: 'inline-block', lineHeight: 0 }}><MonsterArt spec={sp.art} spriteUrl={sp.sprite_url} size={170} anim="none" /></div></div>
            <p className="text-xl font-extrabold text-white">{sp.name} joined your collection!</p>
            <div className="mt-1 flex items-center justify-center gap-2"><TypeBadge type={sp.type} /><RarityBadge rarity={sp.rarity} /><span className="text-sm font-bold text-white/90">Lv. {encounter.level}</span></div>
            <div className="mq-card mt-3 flex justify-around text-[#10285a]">
              <div><p className="text-xs font-bold opacity-70">XP earned</p><p className="text-lg font-extrabold">+{(won.xp ?? 0)} <span className="text-xs opacity-70">(+ answers)</span></p></div>
              <div><p className="text-xs font-bold opacity-70">Coins</p><p className="text-lg font-extrabold">+{won.coins ?? 0} 🪙</p></div>
            </div>
            {levelUp && <p className="mt-2 text-lg font-extrabold text-amber-300">⭐ Level up! You are now level {levelInfo(mq.state.xp).level}</p>}
            <div className="mt-3 flex gap-2">
              <GameButton className="flex-1" tone="green" onClick={() => finish()}>Keep exploring</GameButton>
              <GameButton className="flex-1" tone="blue" onClick={() => finish('monsters')}>My monsters</GameButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
