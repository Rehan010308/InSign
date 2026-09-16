import { useEffect } from 'react';
import SignalBackground from '../components/SignalBackground';
import LandingNav from '../components/LandingNav';
import LandingFooter from '../components/LandingFooter';
import { initLandingInteractions } from '../lib/landing/landingInteractions';

/**
 * Chapter 01-09 of the InSign story. The markup is the original static page,
 * ported verbatim; the sequencers live in initLandingInteractions().
 */
export default function Landing() {
  useEffect(() => initLandingInteractions(), []);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <SignalBackground />
      <LandingNav />
      <main id="main" className="page">

        <section id="hero" className="chapter" aria-labelledby="hero-h">
          <div className="stage-glow" aria-hidden="true"><i className="ga"></i><i className="gb"></i></div>
          <div className="wrap">
            <div className="hero-content">
              <p className="overline rv">01 — <b>INSIGN</b></p>
              <h1 className="hero-title" id="hero-h">
                <span className="mask"><span>Technology</span></span>
                <span className="mask mask-d1"><span>should <em className="serif">adapt</em></span></span>
                <span className="mask mask-d2"><span>to how you</span></span>
                <span className="mask mask-d3"><span>communicate.</span></span>
              </h1>
              <p className="hero-sub rv rv-d2">An accessibility platform with two products: a speech companion that
                learns <em className="serif">your</em> patterns, and a sign translator that tolerates <em className="serif">your</em> movement.</p>
              <div className="hero-ctas rv rv-d3">
                <a className="btn btn-primary magnetic" href="#speech">Explore InSign <span className="arrow">→</span></a>
                <a className="btn btn-secondary" href="#idea">See how it works</a>
              </div>
            </div>
          </div>
          <div className="scroll-cue" aria-hidden="true"><span>SCROLL</span><span className="stem"></span></div>
        </section>
        <section id="idea" className="chapter" aria-labelledby="idea-h">
          <div className="wrap-narrow center">
            <p className="overline rv">02 — <b>THE IDEA</b></p>
            <h2 className="statement" id="idea-h">
              <span className="mask"><span>Communication isn't</span></span>
              <span className="mask mask-d1"><span>one-size-fits-<em className="serif">all</em>.</span></span>
            </h2>
            <p className="lede rv rv-d2" style={{marginTop: '32px'}}>Accessibility tools assume a standard user. Real communication
              isn't standard — every voice has its own rhythm, every pair of hands its own signature.</p>
          </div>
          <div className="wrap">
            <div className="contrast rv rv-d3">
              <div className="col">
                <h3>WHAT TECHNOLOGY EXPECTS</h3>
                <div className="ticks" aria-hidden="true">
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                </div>
                <p className="note">Uniform. Predictable. Interchangeable. Built for the average user, then everyone else is asked to conform.</p>
              </div>
              <div className="col sig">
                <h3>HOW PEOPLE ACTUALLY COMMUNICATE</h3>
                <div className="ticks" aria-hidden="true">
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                </div>
                <p className="note">Irregular. Personal. Alive. And completely normal.</p>
              </div>
            </div>
            <div className="phil-lines center">
              <p>Technology shouldn't ask you to change your voice.</p>
              <p>It should <em className="serif">learn</em> how you already speak.</p>
            </div>
          </div>
        </section>
        <section id="speech" className="chapter" aria-labelledby="speech-h">
          <div className="wrap-narrow center">
            <p className="overline rv">03 — <b>SPEECH COMPANION</b></p>
            <span className="prod-eyebrow micro rv rv-d1" style={{display: 'block', marginBottom: '20px'}}><b style={{color: 'var(--accent)'}}>PRODUCT 01</b> · PRACTICE, NOT JUDGMENT</span>
            <h2 className="statement" id="speech-h">
              <span className="mask"><span>It learns how</span></span>
              <span className="mask mask-d1"><span><em className="serif">you</em> speak.</span></span>
            </h2>
            <p className="lede rv rv-d2" style={{marginTop: '32px'}}>Watch how a practice session becomes personal —
              from a single voice to a pattern InSign can adapt around.</p>
          </div>
          <div className="wrap">
            <div className="sflow" id="speech-story" aria-label="How InSign turns a voice into personalized practice">
              <div className="sflow-spine" aria-hidden="true"></div>
              <span className="sflow-node" style={{top: '0%'}} data-n="0"></span>
              <span className="sflow-node" style={{top: '25%'}} data-n="1"></span>
              <span className="sflow-node" style={{top: '50%'}} data-n="2"></span>
              <span className="sflow-node" style={{top: '75%'}} data-n="3"></span>
              <span className="sflow-node" style={{top: '100%'}} data-n="4"></span>
              <div className="sflow-stage" data-s="0">
                <div className="sflow-side left">
                  <span className="cap">USER SPEAKS</span>
                  <p className="sub">A real voice, with its own rhythm.</p>
                </div>
                <div className="sflow-mid">
                  <div className="mic-orb" id="story-orb">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>
                  </div>
                  <span className="n">01</span>
                </div>
                <div className="sflow-side right">
                  <span className="cap">VOICE SIGNAL</span>
                  <p className="sub">Captured as a continuous waveform.</p>
                </div>
              </div>
              <div className="sflow-stage wide" data-s="1">
                <div className="sflow-side left">
                  <span className="cap">OBSERVED</span>
                  <p className="sub">Every rise and hesitation is recorded.</p>
                </div>
                <div className="sflow-mid">
                  <svg className="voice-canvas" id="story-wave" viewBox="0 0 420 86" preserveAspectRatio="none" role="img" aria-label="The voice waveform"></svg>
                  <span className="n">02</span>
                </div>
                <div className="sflow-side right">
                  <span className="cap">PATTERNS DETECTED</span>
                  <p className="sub">The signal breaks down into four signals.</p>
                </div>
              </div>
              <div className="sflow-stage wider" data-s="2">
                <div className="sflow-side left">
                  <span className="cap">ANALYSIS</span>
                  <p className="sub">Not scores. Shapes of a personal rhythm.</p>
                </div>
                <div className="sflow-mid">
                  <div className="patterns" id="story-patterns">
                    <div className="pattern p-pace">
                      <p className="lbl">PACE</p>
                      <svg viewBox="0 0 72 16" aria-hidden="true"><path className="b b2" d="M2 12 C 12 12, 16 4, 26 4 S 44 13, 54 13 S 68 8, 70 8"/><path className="b" d="M2 12 C 12 12, 16 4, 26 4 S 44 13, 54 13 S 68 8, 70 8" opacity="0"/></svg>
                      <p>words per minute</p>
                    </div>
                    <div className="pattern p-pauses">
                      <p className="lbl">PAUSES</p>
                      <svg viewBox="0 0 72 16" aria-hidden="true"><path className="b" d="M2 8 H 68"/><path className="g" d="M20 3 v 10"/><path className="g" d="M46 3 v 10"/></svg>
                      <p>where they happen</p>
                    </div>
                    <div className="pattern p-reps">
                      <p className="lbl">REPETITIONS</p>
                      <svg viewBox="0 0 72 16" aria-hidden="true"><path className="b" d="M2 11 C 10 11, 12 4, 20 4 C 28 4, 24 13, 32 13 S 46 8, 68 8"/><path className="h" d="M14 10 c -3 -6 6 -8 6 -3 s -7 5 -6 3"/><path className="h" d="M40 10 c -3 -6 6 -8 6 -3 s -7 5 -6 3"/></svg>
                      <p>sounds revisited</p>
                    </div>
                    <div className="pattern p-fillers">
                      <p className="lbl">FILLERS</p>
                      <svg viewBox="0 0 72 16" aria-hidden="true"><path className="b" d="M2 8 H 68"/><circle className="h" cx="24" cy="8" r="2.4"/><circle className="h" cx="44" cy="8" r="2.4"/></svg>
                      <p>patterns of hesitation</p>
                    </div>
                  </div>
                  <span className="n">03</span>
                </div>
                <div className="sflow-side right">
                  <span className="cap">CONVERGES</span>
                  <p className="sub">Four observations, one signature.</p>
                </div>
              </div>
              <div className="sflow-stage" data-s="3">
                <div className="sflow-side left">
                  <span className="cap">YOUR PATTERN</span>
                  <p className="sub"><em className="serif">Longer pauses during interviews.</em></p>
                </div>
                <div className="sflow-mid">
                  <span className="pattern-chip" id="pattern-chip">YOUR PATTERN</span>
                  <span className="n">04</span>
                </div>
                <div className="sflow-side right">
                  <span className="cap">ADAPTED</span>
                  <p className="sub">Practice reshapes itself around it.</p>
                </div>
              </div>
              <div className="sflow-stage" data-s="4">
                <div className="sflow-side left">
                  <span className="cap">NEXT PRACTICE</span>
                  <p className="sub">Shorter prompts, timed to <em className="serif">your</em> pauses.</p>
                </div>
                <div className="sflow-mid">
                  <span className="next-chip" id="next-chip">NEXT PRACTICE — <b>RESHAPE</b>D AROUND YOU</span>
                  <span className="n">05</span>
                </div>
                <div className="sflow-side right">
                  <span className="cap">THE LOOP CONTINUES</span>
                  <p className="sub">Every session makes the next one smarter.</p>
                </div>
              </div>
            </div>
            <p className="micro story-note">OBSERVED → UNDERSTOOD → ADAPTED · DEMO DATA</p>
          </div>
        </section>
        <section id="adaptation" className="chapter" aria-labelledby="adapt-h">
          <div className="wrap-narrow center">
            <p className="overline rv">04 — <b>HOW SPEECH ADAPTS</b></p>
            <h2 className="statement" id="adapt-h">
              <span className="mask"><span>It remembers</span></span>
              <span className="mask mask-d1"><span>every <em className="serif">session</em>.</span></span>
            </h2>
            <p className="lede rv rv-d2" style={{marginTop: '32px'}}>Each practice teaches the system something new.
              Watch the pattern form over four sessions.</p>
          </div>
          <div className="wrap">
            <div className="sessions" id="sessions">
              <div className="sess">
                <p className="num">SESSION 01</p>
                <h3>Interview</h3>
                <p>First attempt. Long pauses before key points.</p>
                <span className="tag">OBSERVING</span>
              </div>
              <div className="sess">
                <p className="num">SESSION 02</p>
                <h3>Interview</h3>
                <p>Pauses land in the same places. A pattern emerges.</p>
                <span className="tag">RECOGNIZING</span>
              </div>
              <div className="sess">
                <p className="num">SESSION 03</p>
                <h3>Conversation</h3>
                <p>Relaxed setting. Pace steadies on its own.</p>
                <span className="tag">COMPARING</span>
              </div>
              <div className="sess">
                <p className="num">SESSION 04</p>
                <h3>Presentation</h3>
                <p>Longer format. Repetitions fade under pressure.</p>
                <span className="tag">CONFIRMING</span>
              </div>
              <div className="sess-lane" aria-hidden="true"></div>
            </div>
            <div className="detect" id="detect">
              <span className="pattern-chip">PATTERN DETECTED</span>
              <h3>More <b>interview</b> practice — with shorter prompts.</h3>
            </div>
          </div>
        </section>
        <section id="sign" className="chapter" aria-labelledby="sign-h">
          <div className="wrap-narrow center">
            <p className="overline rv">05 — <b>SIGN TRANSLATOR</b></p>
            <span className="prod-eyebrow micro rv rv-d1" style={{display: 'block', marginBottom: '20px'}}><b style={{color: 'var(--accent)'}}>PRODUCT 02</b> · MOVEMENT, TOLERATED</span>
            <h2 className="statement" id="sign-h">
              <span className="mask"><span>Your hands aren't perfect.</span></span>
              <span className="mask mask-d1"><span>Neither is <em className="serif">ours</em>.</span></span>
            </h2>
            <p className="lede rv rv-d2" style={{marginTop: '32px'}}>Point your camera at a sign. InSign reads the landmarks of your
              hand, absorbs natural movement — including tremor — and recognizes the sign anyway.</p>
            <div className="row sign-badges rv rv-d3">
              <span className="badge"><span className="dot" style={{background: 'var(--state-success)'}}></span>CAMERA-BASED</span>
              <span className="badge">WORKS WITH NATURAL MOVEMENT</span>
              <span className="badge badge-demo">DEMO DATA</span>
            </div>
          </div>
        </section>
        <section id="movement" className="chapter" aria-labelledby="mv-h">
          <div className="wrap-narrow center">
            <p className="overline rv">06 — <b>RAW → STABILIZED → RECOGNIZED</b></p>
            <h2 className="statement" id="mv-h">
              <span className="mask"><span>The tremor stays.</span></span>
              <span className="mask mask-d1"><span>The meaning <em className="serif">survives</em>.</span></span>
            </h2>
            <p className="lede rv rv-d2" style={{marginTop: '32px'}}>Watch an unstable movement become a recognized sign —
              without asking the hand to change.</p>
          </div>
          <div className="wrap">
            <div className="movement rv rv-d1">
              <div className="mv-stage">
                <canvas id="mv-canvas" role="img" aria-label="A trembling raw movement path stabilizing into a smooth path, ending in a recognized sign"></canvas>
                <div className="mv-hud" aria-hidden="true">
                  <span className="mv-tag"><i></i>RAW MOVEMENT</span>
                  <span className="mv-tag stable"><i></i>STABILIZED MOVEMENT</span>
                </div>
                <button type="button" className="mv-replay" id="mv-replay">REPLAY</button>
                <div className="mv-result" id="mv-result" role="status">
                  <span className="mv-chip">RECOGNISED: "THANK YOU"</span>
                  <span className="mv-conf">
                    <span className="micro" style={{display: 'flex', justifyContent: 'space-between', marginBottom: '6px'}}>
                      <span>CONFIDENCE</span><span>0.91</span>
                    </span>
                    <span className="bar"><i id="mv-conf-fill"></i></span>
                  </span>
                  <span className="badge badge-demo">DEMO DATA</span>
                </div>
              </div>
              <div className="mv-steps" aria-hidden="true">
                <div className="mv-step" data-step="0">RAW MOVEMENT</div><div className="mv-seg"></div>
                <div className="mv-step" data-step="1">STABILIZED</div><div className="mv-seg"></div>
                <div className="mv-step" data-step="2">RECOGNIZED</div>
              </div>
            </div>
          </div>
        </section>
        <section id="technology" className="chapter" aria-labelledby="tech-h">
          <div className="wrap-narrow center">
            <p className="overline rv">07 — <b>HOW THE TECHNOLOGY WORKS</b></p>
            <h2 className="statement" id="tech-h">
              <span className="mask"><span>Two pipelines.</span></span>
              <span className="mask mask-d1"><span>One <em className="serif">principle</em>.</span></span>
            </h2>
            <p className="lede rv rv-d2" style={{marginTop: '32px'}}>Follow the signal — from a voice or a hand to meaning.
              The same journey in both products: observe, stabilize, adapt.</p>
          </div>
          <div className="wrap">
            <div className="pipelines">
              <div className="pipe rv" data-pipe>
                <p className="pipe-title"><b>SPEECH</b> · FROM VOICE TO PRACTICE</p>
                <div className="pipe-flow" id="pipe-speech">
                  <div className="pipe-node"><p className="lbl">MIC</p><p>your voice</p></div>
                  <div className="pipe-seg" aria-hidden="true"><i></i></div>
                  <div className="pipe-node"><p className="lbl">SPEECH ANALYSIS</p><p>pace · pauses</p></div>
                  <div className="pipe-seg" aria-hidden="true"><i></i></div>
                  <div className="pipe-node"><p className="lbl">PATTERN</p><p>your signature</p></div>
                  <div className="pipe-seg" aria-hidden="true"><i></i></div>
                  <div className="pipe-node"><p className="lbl">PERSONALIZATION</p><p>next practice</p></div>
                </div>
              </div>
              <div className="pipe rv rv-d1" data-pipe>
                <p className="pipe-title"><b>SIGN</b> · FROM HAND TO TEXT</p>
                <div className="pipe-flow five" id="pipe-sign">
                  <div className="pipe-node"><p className="lbl">CAMERA</p><p>the scene</p></div>
                  <div className="pipe-seg" aria-hidden="true"><i></i></div>
                  <div className="pipe-node"><p className="lbl">LANDMARKS</p><p>21 points</p></div>
                  <div className="pipe-seg" aria-hidden="true"><i></i></div>
                  <div className="pipe-node"><p className="lbl">STABILIZATION</p><p>tremor absorbed</p></div>
                  <div className="pipe-seg" aria-hidden="true"><i></i></div>
                  <div className="pipe-node"><p className="lbl">RECOGNITION</p><p>over time</p></div>
                  <div className="pipe-seg" aria-hidden="true"><i></i></div>
                  <div className="pipe-node"><p className="lbl">SIGN</p><p>as text</p></div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="philosophy" className="chapter" aria-labelledby="phil-h">
          <div className="wrap-narrow center">
            <p className="overline rv">08 — <b>PHILOSOPHY</b></p>
            <h2 className="sr-only" id="phil-h">Philosophy</h2>
            <div className="phil-stack">
              <p className="statement">
                <span className="mask"><span>Human communication</span></span>
                <span className="mask mask-d1"><span>isn't <em className="serif">standardized</em>.</span></span>
              </p>
              <p className="statement">
                <span className="mask mask-d2"><span>Technology shouldn't be either.</span></span>
              </p>
            </div>
            <p className="lede phil-explain rv rv-d3">InSign adapts technology around individual communication patterns —
              instead of forcing everyone into the same interaction model.</p>
          </div>
        </section>
        <section id="contact" className="chapter" aria-labelledby="contact-h">
          <div className="contact-signal" aria-hidden="true"></div>
          <div className="wrap-narrow contact-inner">
            <p className="overline rv">09 — <b>CONTACT</b></p>
            <h2 className="statement" id="contact-h">
              <span className="mask"><span>Let's make technology</span></span>
              <span className="mask mask-d1"><span>more <em className="serif">accessible</em>.</span></span>
            </h2>
            <p className="lede contact-lede rv rv-d2">Have a question, want to collaborate, or want to learn more about InSign?</p>
            <div className="rv rv-d3">
              <a className="email-link" href="mailto:rehan.badar0103@gmail.com">rehan.badar0103@gmail.com <span className="arrow">↗</span></a>
            </div>
            <div className="contact-meta rv rv-d3">
              <span className="micro">USUALLY REPLIES WITHIN A DAY</span>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
