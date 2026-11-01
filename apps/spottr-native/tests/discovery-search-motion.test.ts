import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { initialSearchBounds, keyboardMorphProgress, searchDismissSpring, searchMorphGeometry, searchMorphSpring, iosSearchOpenSpring, iosSearchCloseSpring, iosSearchPressExpansion, iosSearchFocusFallbackMs } from '../src/screens/searchMorph';
const { hooks, modules } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture(reduced = false, platform = 'ios', deferredFrames = false) {
  const h = hooks(), react = { ...h.react, useLayoutEffect: h.react.useEffect };
  let handlers: any, visibility: any, onUI = false, motion: any, listener: any, reacting = false;
  const springs: any[] = [], queued: (() => void)[] = [], values: any[] = [], reactions: any[] = [], notifications: boolean[] = [];
  const displayFrames: (() => void)[] = [];
  let completed = 0, focusReady = 0;
  const origins: string[] = [], animations = new Map<any, any>();
  const ui = (fn: any, ...args: any[]) => {
    const previous = onUI; onUI = true;
    try {
      const value = fn(...args);
      if (!reacting) {
        reacting = true;
        for (const r of reactions) { const next = r.prepare(); if (next !== r.previous) { const old = r.previous; r.previous = next; r.effect(next, old); } }
        reacting = false;
      }
      return value;
    } finally { onUI = previous; }
  };
  const shared = (initial: any) => {
    let value = initial;
    const box = {
      get value() { assert.ok(onUI, 'No shared-value reads on JS'); return value; },
      set value(next: any) {
        if (next?.spring) { const spring = { ...next, box }; springs.push(spring); animations.set(box, spring); }
        else { animations.delete(box); value = next; }
      },
    };
    values.push(box); return box;
  };
  const { useDiscoverySearchMotion } = modules({
    react,
    'react-native': { Platform: { OS: platform }, AccessibilityInfo: { addEventListener: (_: string, fn: any) => { listener = fn; return { remove: () => {} }; } } },
    'react-native-reanimated': {
      useReducedMotion: () => reduced,
      useSharedValue: (initial: any) => react.useRef(shared(initial)).current,
      useAnimatedReaction: (prepare: any, effect: any) => {
        const r = react.useRef({ prepare, effect, previous: null, registered: false }).current;
        r.prepare = prepare; r.effect = effect;
        if (!r.registered) { r.registered = true; reactions.push(r); }
      },
      withSpring: (target: number, config: any, callback: any) => ({ spring: true, target, config, callback }),
      withDelay: (delay: number, animation: any) => ({ ...animation, delay }),
      cancelAnimation: (box: any) => animations.delete(box), ReduceMotion: { Always: 'always', Never: 'never', System: 'system' },
      runOnUI: (fn: any) => (...args: any[]) => ui(fn, ...args),
      runOnJS: (fn: any) => (...args: any[]) => { queued.push(() => fn(...args)); },
    },
    './useSearchKeyboardEvents': { useSearchKeyboardEvents: (value: any, native: any) => { handlers = value; visibility = native; } },
  }, { requestAnimationFrame: (fn: () => void) => { if(deferredFrames)displayFrames.push(fn);else ui(fn);return 0; } }).load(path.resolve(__dirname, '../src/screens/useDiscoverySearchMotion.ts'));
  const render = () => { motion = h.render(() => useDiscoverySearchMotion(false, () => completed++, (next: boolean, origin: string) => { notifications.push(next); origins.push(origin); }, () => focusReady++)); };
  render();
  return {
    open: () => motion.setOpen(true), close: () => motion.setOpen(false), detach: () => motion.detach(),
    pressIn: () => motion.pressIn(), pressOut: () => motion.pressOut(),
    releaseGesture: () => motion.releaseKeyboardGesture(),
    launch: () => ui(() => motion.launchExpansion.value),
    set: (value: number) => ui(() => { motion.progress.value = value; }),
    advance: (value: number) => ui(() => {
      const animation = animations.get(motion.progress);
      motion.progress.value = value;
      if (animation) animations.set(motion.progress, animation);
    }),
    progress: () => ui(() => motion.progress.value),
    event: (name: string, progress: number, timestamp?: number) => ui(handlers[name], { progress, height: 300 * progress, duration: 250, target: 7, timestamp }),
    native: (name: string) => visibility[name](),
    flush: () => { while (queued.length) queued.shift()!(); render(); },
    finishSpring: (index = springs.length - 1) => { const spring = springs[index]; ui(() => {
      const active = animations.get(spring.box) === spring;
      if (active) spring.box.value = spring.target;
      spring.callback?.(active);
    }); },
    reduce: (value: boolean) => { listener(value); render(); },
    dispose: () => h.unmount(), springs, notifications, origins, controlsReady: () => motion.controlsReady,
    phase: () => motion.phase, isOpen: () => motion.isOpen(), completed: () => completed,
    focusReady: () => focusReady,
    inputPrepared: () => motion.inputPrepared(),
    inputBlurred: () => motion.inputBlurred(),
    frame: () => { const pending=displayFrames.splice(0); pending.forEach(fn=>ui(fn)); },
  };
}

test('search geometry stays rounded and bounded throughout its shared path', () => {
  for (const width of [240, 280, 350, 728]) {
    const bounds = initialSearchBounds(width);
    const start = searchMorphGeometry(bounds, 0), end = searchMorphGeometry(bounds, 1);
    assert.equal(start.searchWidth, 44); assert.equal(start.radius, 22);
    assert.equal(end.searchX, 52); assert.equal(end.searchWidth + end.searchX, width);
    assert.equal(end.radius, 22); assert.equal(end.back, 1); assert.equal(end.controls, 0);
    for (let step = 0; step <= 120; step++) {
      const frame = searchMorphGeometry(bounds, step / 120);
      assert.ok(frame.searchX + frame.searchWidth <= width + .001);
      assert.ok(frame.searchX >= 52 - .001, 'Search never intersects the fixed Back circle');
      assert.equal(frame.radius * 2, frame.searchHeight, 'Search stays fully rounded');
      if (frame.controls > 0) {
        assert.equal(frame.back, 0, 'Back and the switch materials cannot stack');
      }
    }
    assert.equal(searchMorphGeometry(bounds, .2).text, 0, 'Text waits for space');
  }
});

test('controls crossfade across multiple morph positions and text disappears before its viewport clips', () => {
  for (const width of [240, 280, 350, 728]) for (const textWidth of [24, 144, 240, 900]) {
    const bounds = initialSearchBounds(width);
    for (let i = 0; i <= 120; i++) {
      const frame = searchMorphGeometry(bounds, i / 120, textWidth);
      if (frame.text > 0) assert.ok(frame.searchWidth > Math.min(textWidth, bounds.destination.width - 76) + 44);
    }
    const early = searchMorphGeometry(bounds, .15), later = searchMorphGeometry(bounds, .3);
    assert.ok(early.controls < 1 && early.controls > later.controls && later.controls > 0, 'No endpoint-only visibility swap');
    assert.equal(early.back, 0); assert.equal(later.back, 0);
  }
});

test('morph uses measured endpoints, including non-default positions and sizes', () => {
  const bounds = { source: { x: 201.5, y: 1.25, width: 44, height: 44 }, destination: { x: 54.5, y: 2.5, width: 301.25, height: 44 } };
  const start = searchMorphGeometry(bounds, 0), end = searchMorphGeometry(bounds, 1);
  assert.equal(start.searchX, bounds.source.x); assert.equal(start.searchY, bounds.source.y);
  assert.equal(end.searchX, bounds.destination.x); assert.equal(end.searchY, bounds.destination.y);
  assert.equal(end.searchWidth, bounds.destination.width);
  for (let i = 0; i <= 120; i++) {
    const frame = searchMorphGeometry(bounds, i / 120);
    assert.equal(frame.contentWidth, bounds.destination.width, 'Input has fixed destination bounds');
    if (i) assert.ok(Math.abs(frame.searchX - searchMorphGeometry(bounds, (i - 1) / 120).searchX) < 2, 'No geometry discontinuity');
  }
});

test('terminal elasticity stays inside screen insets and Back never bounces on exit', () => {
  assert.ok(searchMorphSpring.stiffness / searchMorphSpring.mass < searchDismissSpring.stiffness / searchDismissSpring.mass);
  for (const width of [240, 280, 362, 728]) {
    const bounds = initialSearchBounds(width);
    for (const p of [-.05, -.015, -.005, 0, .45, .65, .8, .98, 1, 1.005, 1.02, 1.1]) {
      const opening = searchMorphGeometry(bounds, p);
      assert.ok(opening.fieldScaleX >= 1 && opening.fieldScaleX <= 1.015);
      assert.ok(bounds.destination.width * (opening.fieldScaleX - 1) <= 6 + 1e-8);
      assert.ok(opening.backScale >= .93 && opening.backScale <= 1.035);
      if (opening.fieldScaleX > 1) assert.equal(opening.backScale, 1, 'Back finishes before the capsule overshoots');
      const closing = searchMorphGeometry(bounds, p, 144, { opening: false, interactive: false, reduced: false });
      assert.ok(closing.backScale <= 1); assert.equal(closing.fieldScaleX, 1);
      assert.ok(closing.sourceScale >= 1 && closing.sourceScale <= 1.01);
      const drag = searchMorphGeometry(bounds, p, 144, { opening: true, interactive: true, reduced: false });
      assert.equal(drag.fieldScaleX, 1); assert.equal(drag.sourceScale, 1);
      const reduced = searchMorphGeometry(bounds, p, 144, { opening: true, interactive: false, reduced: true });
      assert.equal(reduced.fieldScaleX, 1); assert.equal(reduced.sourceScale, 1);
      assert.equal(reduced.backScale, 1); assert.equal(reduced.controlsScale, 1);
    }
  }
});

test('opening spends time on visible travel instead of a fast jump followed by a long tail', () => {
  const { stiffness, damping, mass } = searchMorphSpring;
  const alpha = damping / (2 * mass), frequency = Math.sqrt(stiffness / mass - alpha * alpha);
  const bounds = initialSearchBounds(362);
  const fraction = (ms: number) => {
    const t = ms / 1000;
    const progress = 1 - Math.exp(-alpha * t) * (Math.cos(frequency * t) + alpha / frequency * Math.sin(frequency * t));
    return (searchMorphGeometry(bounds, progress).searchWidth - 44) / (bounds.destination.width - 44);
  };
  assert.ok(fraction(100) < .25, 'The capsule cannot consume most of its travel in the first 100ms');
  const times = Array.from({ length: 701 }, (_, ms) => ms);
  const first = times.find(ms => fraction(ms) >= .1)!;
  const last = times.find(ms => fraction(ms) >= .9)!;
  assert.ok(last - first >= 190 && last - first <= 430, 'Most of the visible morph has a relaxed, bounded duration');
  assert.ok(fraction(450) >= .99, 'The field reaches its destination without a prolonged half-open state');
});

test('iOS opening inherits the press and a completed opening cannot replay it on close', () => {
  const f=fixture();f.pressIn();f.finishSpring();f.pressOut();f.open();f.flush();
  assert.equal(f.launch(),iosSearchPressExpansion,'release does not erase the current pressed extent before the morph');
  assert.equal(f.springs.at(-1).config.stiffness,iosSearchOpenSpring.stiffness);
  f.advance(.35);const carried=f.launch();f.close();f.flush();
  assert.equal(f.launch(),carried,'an interrupted close relaxes from the displayed extent instead of jumping');
  const complete=fixture();complete.pressIn();complete.finishSpring();complete.open();complete.flush();
  complete.finishSpring();assert.equal(complete.launch(),0);
  complete.event('onStart',1);complete.event('onEnd',1);complete.close();complete.event('onStart',0);
  assert.equal(complete.launch(),0);assert.equal(complete.springs.at(-1).config.overshootClamping,false);
});

test('iOS geometry carries the press and scales the controls group into place before settling', () => {
  const bounds=initialSearchBounds(350),native={opening:true,interactive:false,reduced:false,ios:true,pressExpansion:iosSearchPressExpansion};
  const first=searchMorphGeometry(bounds,0,144,native);
  assert.equal(first.searchWidth,47);assert.equal(first.searchHeight,47);
  assert.equal(first.searchX+first.searchWidth/2,bounds.source.x+22);
  assert.equal(first.searchY+first.searchHeight/2,22);
  const middle=searchMorphGeometry(bounds,.5,144,native);
  assert.ok(middle.searchHeight>44&&middle.searchHeight<47,'The small pressed extent relaxes during expansion');
  for(let i=0;i<=100;i++){
    const frame=searchMorphGeometry(bounds,i/100,144,native);
    assert.equal(frame.radius*2,frame.searchHeight);
    assert.ok(frame.controlsScale>=.96&&frame.controlsScale<=1,'The controls group grows into place during travel');
    assert.ok(frame.searchX+frame.searchWidth<=350+5);
  }
  const end=searchMorphGeometry(bounds,-.02,144,{...native,opening:false,pressExpansion:0});
  assert.equal(end.searchWidth,44);assert.equal(end.searchHeight,44);assert.equal(end.sourceScale,1.035);
  assert.equal(end.fieldScaleY,1);
  const landing=searchMorphGeometry(bounds,1.02,144,{...native,pressExpansion:0});
  assert.ok(landing.fieldScaleY>1,'One small vertical settle accompanies arrival');
  assert.equal(landing.backScale,landing.fieldScaleY,'Back lands with the field instead of finishing before it');
  assert.equal(searchMorphGeometry(bounds,1.02,144,{...native,opening:false,pressExpansion:0}).backScale,landing.backScale,'Reversing at the peak cannot snap Back');
  for (let p=0;p<=1;p+=.05) {
    const exit=searchMorphGeometry(bounds,p,144,{...native,opening:false,pressExpansion:0});
    assert.ok(exit.backScale>=.93&&exit.backScale<=1,'A normal close does not inflate Back');
  }
  assert.equal(searchMorphGeometry(bounds,1.02,144,{...native,reduced:true}).backScale,1);
  assert.equal(searchMorphGeometry(bounds,1.02,144,{...native,opening:false,pressExpansion:0}).fieldScaleY,landing.fieldScaleY,'Reversing at the peak preserves the displayed shape');
  const reduced=searchMorphGeometry(bounds,0,144,{...native,reduced:true});assert.equal(reduced.searchWidth,44);
});

test('iOS arrival remains one continuous expansion across the native-material handoff', () => {
  const motion={opening:true,interactive:false,reduced:false,ios:true};
  for (const width of [240,280,350,728]) {
    const bounds=initialSearchBounds(width), destination=bounds.destination;
    for (const p of [.98,.9999,1,1.0001,1.01,1.02,1.1]) {
      const frame=searchMorphGeometry(bounds,p,144,motion);
      assert.equal(frame.fieldScaleX,1,'No second scale begins after horizontal travel stops');
      assert.ok(frame.searchWidth<=destination.width*1.02&&frame.searchWidth<=destination.width+6);
      assert.ok(frame.searchX>=48,'The overshooting field cannot collide with the Back circle');
      if(p>=1) {
        assert.ok(Math.abs(frame.searchWidth-destination.width*frame.destinationScaleX)<1e-8);
        assert.ok(Math.abs(frame.searchX-destination.x-frame.destinationOffsetX)<1e-8);
      }
    }
    const before=searchMorphGeometry(bounds,.9999,144,motion), after=searchMorphGeometry(bounds,1.0001,144,motion);
    assert.ok(Math.abs(after.searchWidth-before.searchWidth)<.15,'No width discontinuity at arrival');
  }
});

test('iOS controls reappear over the last part of collapse while text is hidden before clipping', () => {
  const bounds=initialSearchBounds(350), motion={opening:false,interactive:false,reduced:false,ios:true};
  const a=searchMorphGeometry(bounds,.2,144,motion), b=searchMorphGeometry(bounds,.1,144,motion), end=searchMorphGeometry(bounds,0,144,motion);
  assert.ok(a.controls>0&&a.controls<b.controls&&b.controls<end.controls);
  assert.ok(a.controlsScale<b.controlsScale&&b.controlsScale<end.controlsScale);
  assert.equal(end.controlsScale,1);
  assert.equal(searchMorphGeometry(bounds,.4,24,motion).text,0,'Even short text disappears before the final collapse');
  const opacity=[.55,.65,.75,.85,.95].map(p=>searchMorphGeometry(bounds,p,108,motion).text);
  assert.ok(opacity[0]!>0&&opacity[0]!<.2&&opacity[3]!<1);
  assert.ok(opacity.every((value,i)=>i===0||value>opacity[i-1]!),'Text reveals before the glass handoff over several positions');
  const drag=searchMorphGeometry(bounds,-.02,144,{...motion,interactive:true});
  assert.equal(drag.sourceScale,1,'No settle occurs under a held finger');
});

test('iOS reference spring reaches its expanded shape around 300ms with one small settle',()=>{
  const {mass,stiffness,damping}=iosSearchOpenSpring,alpha=damping/(2*mass),frequency=Math.sqrt(stiffness/mass-alpha*alpha);
  const at=(t:number)=>1-Math.exp(-alpha*t)*(Math.cos(frequency*t)+alpha/frequency*Math.sin(frequency*t));
  assert.ok(at(.1)>.4&&at(.1)<.65);assert.ok(at(.25)>.98);
  assert.ok(at(Math.PI/frequency)>1&&at(Math.PI/frequency)<1.02);
});

test('iOS controls return for 120–160ms within the closing spring without stacking glass', () => {
  const { mass, stiffness, damping } = iosSearchCloseSpring;
  const alpha = damping / (2 * mass), frequency = Math.sqrt(stiffness / mass - alpha * alpha);
  const at = (ms: number) => {
    const t = ms / 1000;
    return Math.exp(-alpha * t) * (Math.cos(frequency * t) + alpha / frequency * Math.sin(frequency * t));
  };
  const motion = { ios: true, opening: false, interactive: false, reduced: false };
  for (const width of [240, 280, 350, 728]) {
    const bounds = initialSearchBounds(width);
    const frames = Array.from({ length: 501 }, (_, ms) => searchMorphGeometry(bounds, at(ms), 144, motion));
    const first = frames.findIndex(frame => frame.controls > 0);
    const last = frames.findIndex(frame => frame.controls === 1);
    assert.ok(at(first) <= .4 && at(first) >= .35, 'Return begins during the final 35–40% of travel');
    assert.ok(last - first >= 120 && last - first <= 160, 'Entrance derives its duration from the existing spring');
    for (let i = first; i <= last; i++) {
      const frame = frames[i]!;
      assert.equal(frame.back, 0, 'Back cannot overlap the returning segmented control');
      assert.ok(frame.controlsScale >= .96 && frame.controlsScale <= 1.016);
      assert.ok(frame.controlsTranslateY >= 0 && frame.controlsTranslateY <= 4);
      const cutout = frame.controlsCutout;
      assert.equal(cutout.x - 8 + 1, frame.searchX, 'The padded mask follows the moving capsule');
      assert.equal(cutout.y - 8 + 1, frame.searchY);
      assert.equal(cutout.width, frame.searchWidth + 2);
      assert.equal(cutout.rx * 2, cutout.height, 'The clearance remains rounded instead of slicing Filter vertically');
      if (i > first) {
        assert.ok(frame.controls >= frames[i - 1]!.controls);
        assert.ok(frame.controlsTranslateY <= frames[i - 1]!.controlsTranslateY);
      }
    }
    assert.equal(frames[last]!.controlsTranslateY, 0);
    const peak = Math.max(...frames.map(frame => frame.sourceScale));
    assert.ok(peak > 1.025 && peak <= 1.035, 'The circle has a visible but restrained settle within the same spring');
    const groupPeak = Math.max(...frames.map(frame => frame.controlsScale));
    assert.ok(groupPeak > 1.012 && groupPeak <= 1.016, 'Switch and Filter share a smaller elastic settle');
    assert.ok(frames.some(frame => frame.controlsScale === groupPeak && frame.sourceScale === peak), 'The whole header settles together');
    assert.ok(frames.at(-1)!.controlsScale < 1.001 && frames.at(-1)!.sourceScale < 1.001, 'No delayed rebound after the return');
    assert.equal(searchMorphGeometry(bounds, 0, 144, motion).sourceScale, 1);
    assert.equal(searchMorphGeometry(bounds, 0, 144, motion).controlsScale, 1);
  }
});

test('native press handoff, reversal and reduced motion preserve continuous geometry', () => {
  const bounds = initialSearchBounds(350);
  const motion = { ios: true, opening: true, interactive: false, reduced: false, pressExpansion: iosSearchPressExpansion };
  const held = searchMorphGeometry(bounds, 0, 144, { ...motion, opening: false, pressExpansion: 0, pressProgress: 1 });
  const released = searchMorphGeometry(bounds, 0, 144, { ...motion, pressProgress: 0 });
  assert.equal(held.sourcePressScale, released.sourcePressScale, 'The source cannot shrink while focus is prepared');
  assert.ok(Math.abs(bounds.source.width * held.sourcePressScale - released.searchWidth) < 1e-8, 'Press and morph share the same initial width');
  assert.ok(Math.abs(bounds.source.height * held.sourcePressScale - released.searchHeight) < 1e-8);
  const cancelled = searchMorphGeometry(bounds, 0, 144, { ...motion, opening: false, pressExpansion: 0, pressProgress: 0 });
  assert.equal(cancelled.sourcePressScale, 1, 'Cancelling a press returns the source without activating Search');
  let previous = searchMorphGeometry(bounds, 0, 144, motion);
  for (let i = 1; i <= 1000; i++) {
    const frame = searchMorphGeometry(bounds, i / 1000, 144, motion);
    assert.ok(frame.searchWidth > previous.searchWidth, 'The carried press must stretch immediately, without shrinking or pausing first');
    assert.ok(frame.searchHeight <= previous.searchHeight, 'Press relaxation belongs to the expansion');
    assert.ok(frame.searchWidth - previous.searchWidth < .3, 'No discontinuity across the early material handoff');
    previous = frame;
  }
  for (const p of [-.04, -.02, -.008, 0, .1, .25, .38, .5, 1, 1.015]) {
    const opening = searchMorphGeometry(bounds, p, 144, { ...motion, pressExpansion: 0 });
    const closing = searchMorphGeometry(bounds, p, 144, { ...motion, opening: false, pressExpansion: 0 });
    assert.deepEqual(opening, closing, 'Reversal cannot switch geometry or restart the controls entrance');
    for (const variant of [{ interactive: true, reduced: false }, { interactive: false, reduced: true }]) {
      const frame = searchMorphGeometry(bounds, p, 144, { ...motion, ...variant });
      assert.equal(frame.sourceScale, 1); assert.equal(frame.fieldScaleY, 1); assert.equal(frame.sourcePressScale, 1);
      if (p <= 0) assert.equal(frame.controlsScale, 1, 'No controls rebound under the finger or with reduced motion');
      if (variant.reduced) { assert.equal(frame.controlsScale, 1); assert.equal(frame.controlsTranslateY, 0); }
    }
  }
});

test('focus waits for UI intent and invisible controls cannot activate during a reversal', () => {
  const f = fixture(); f.open(); assert.deepEqual(f.notifications, []);
  f.flush(); assert.deepEqual(f.notifications, [true]); assert.equal(f.controlsReady(), false);
  f.set(1); f.event('onStart', 1); f.event('onEnd', 1); f.close(); f.flush();
  assert.equal(f.controlsReady(), false, 'A repeated Back cannot activate the invisible map/list switch');
  f.event('onStart', 0); f.event('onMove', .15); f.flush(); assert.equal(f.controlsReady(), false);
  f.advance(.01); f.flush(); assert.equal(f.controlsReady(), true);
  f.open(); f.close(); f.flush(); assert.equal(f.notifications.at(-1), false, 'An obsolete focus request is ignored');
});

test('iOS prepares its responder before expansion and cannot refocus an abandoned opening', () => {
  const f=fixture(); f.open(); f.flush(); assert.equal(f.focusReady(),1); assert.equal(f.progress(),0);
  assert.equal(f.springs.at(-1).delay,iosSearchFocusFallbackMs,'Only a safety timeout runs before native focus');
  f.inputPrepared(); assert.equal(f.springs.at(-1).delay,undefined,'Focus starts the spring without waiting for a timer');
  const count=f.springs.length; f.inputPrepared(); f.event('onStart',1);
  assert.equal(f.springs.length,count,'Focus and keyboard acknowledgements cannot restart the spring');
  f.advance(.99); f.flush(); assert.equal(f.focusReady(),1);
  f.advance(1.02); f.flush(); assert.equal(f.focusReady(),1,'Landing cannot refocus the input');
  f.advance(.2);f.advance(.7);f.flush();assert.equal(f.focusReady(),1,'A cancelled keyboard drag cannot repeat the focus request');
  const interrupted=fixture(); interrupted.open(); interrupted.close(); interrupted.flush();
  assert.equal(interrupted.focusReady(),0,'Queued focus belongs to the abandoned request');
  const afterClose=interrupted.springs.length; interrupted.inputPrepared();
  assert.equal(interrupted.springs.length,afterClose,'Late focus cannot reopen a closed Search');
  interrupted.finishSpring(); interrupted.flush(); interrupted.open(); interrupted.flush();
  interrupted.finishSpring(); interrupted.flush(); assert.equal(interrupted.focusReady(),1);
});

test('missing keyboard or focus acknowledgement cannot leave Search collapsed', () => {
  const f=fixture(); f.open(); f.flush(); f.finishSpring();
  assert.equal(f.progress(),1); const count=f.springs.length; f.inputPrepared();
  assert.equal(f.springs.length,count,'Late focus cannot restart an already completed opening');
  f.close(); f.flush(); f.finishSpring(); f.flush(); assert.equal(f.phase(),'closed');
});

test('native responder preparation waits for a fresh frame and discards superseded frame callbacks', () => {
  const f=fixture(false,'ios',true);f.open();f.flush();f.inputPrepared();
  const before=f.springs.length;assert.equal(f.progress(),0);f.frame();
  assert.equal(f.springs.length,before+1);assert.equal(f.springs.at(-1).delay,undefined);
  f.finishSpring();f.event('onStart',1);f.event('onEnd',1);f.close();f.inputBlurred();
  const beforeReopen=f.springs.length;f.open();f.flush();f.frame();
  assert.equal(f.springs.length,beforeReopen+1,'An old closing frame cannot replace the new opening');
  assert.equal(f.springs.at(-1).target,1);
  const cancelled=fixture(false,'ios',true);cancelled.open();cancelled.flush();cancelled.inputPrepared();
  cancelled.close();cancelled.flush();const closedCount=cancelled.springs.length;cancelled.frame();
  assert.equal(cancelled.springs.length,closedCount);assert.equal(cancelled.phase(),'closed');
});

test('keyboard presentation leaves the opening spring in charge; dismissal uses a bounded finish', () => {
  const f = fixture(); f.open(); f.advance(.15);
  f.event('onStart', 1); f.event('onMove', .4);
  assert.equal(f.progress(), .15, 'Automatic keyboard frames cannot consume the opening travel');
  f.event('onEnd', 1); assert.equal(f.progress(), .15, 'Keyboard completion cannot snap the unfinished morph');
  f.finishSpring(); assert.equal(f.progress(), 1);
  const springsBeforeClose = f.springs.length;
  f.close(); assert.equal(f.progress(), 1); assert.equal(f.springs.length, springsBeforeClose, 'Resigning the native responder must not block a running collapse');
  f.inputBlurred();assert.equal(f.springs.length,springsBeforeClose+1,'Collapse begins at native blur, before keyboard movement');
  f.advance(.7);f.event('onStart', 0);assert.equal(f.springs.length,springsBeforeClose+1,'Keyboard acknowledgement cannot restart the collapse');
  f.event('onMove', .55); assert.equal(f.progress(), .7, 'Native tail cannot overwrite the finish');
  assert.equal(f.springs.at(-1).config.stiffness, iosSearchCloseSpring.stiffness);
  f.event('onEnd', 0); f.finishSpring(); f.flush(); assert.equal(f.progress(), 0); assert.equal(f.completed(), 1);
});

test('willShow cannot park the morph while iOS prepares its first keyboard frame', () => {
  const f = fixture(); f.open(); f.flush(); f.event('onStart', 1); f.event('onMove', 0);
  f.finishSpring(); assert.equal(f.progress(), 1, 'Opening spring survives the non-moving presentation interval');
  f.event('onMove', .05); assert.equal(f.progress(), 1, 'Native handover cannot rewind the displayed shape');
  f.event('onEnd', 1); f.close(); f.event('onStart', 0); f.event('onMove', .5);
  assert.equal(f.springs.at(-1).target, 0, 'Native dismissal starts the short finish');
});

test('late or repeated keyboard-show events cannot rewind or restart the opening spring', () => {
  const f = fixture(); f.open(); f.advance(.15); f.event('onStart', 1);
  const count = f.springs.length;
  f.advance(.4); f.event('onMove', 0); assert.equal(f.progress(), .4);
  f.event('onMove', .1); f.event('onStart', 1); f.event('onMove', .9);
  assert.equal(f.progress(), .4); assert.equal(f.springs.length, count);
  f.finishSpring(); assert.equal(f.progress(), 1);
});

function shown() {
  const f = fixture(); f.open(); f.flush();
  f.event('onStart', 1); f.event('onMove', 1); f.event('onEnd', 1); f.flush();
  f.finishSpring();
  return f;
}

test('manual native dismissal automatically reverses Search and completes exactly once', () => {
  const f = shown();
  f.event('onStart', 0); f.flush();
  assert.equal(f.phase(), 'closing'); assert.equal(f.isOpen(), false);
  assert.deepEqual(f.origins, ['command', 'keyboard'], 'No second native dismiss/focus command');
  f.advance(.55); f.event('onMove', .8); assert.equal(f.progress(), .55);
  const count = f.springs.length;
  f.event('onEnd', 0); f.native('onDidHide'); f.event('onEnd', 0); f.finishSpring(); f.flush();
  assert.equal(f.springs.length, count, 'Duplicate native notifications do not restart the finish');
  assert.equal(f.phase(), 'closed'); assert.equal(f.progress(), 0); assert.equal(f.completed(), 1);
  assert.deepEqual(f.notifications, [true, false]); assert.equal(f.controlsReady(), true);
});

test('iOS interactive drag follows every frame, including an upward cancellation', () => {
  const f = shown();
  for (const p of [.9, .65, .4, .55]) { f.event('onInteractive', p); assert.ok(Math.abs(f.progress() - p) < 1e-8); }
  f.flush(); assert.equal(f.phase(), 'open'); assert.equal(f.isOpen(), true);
  assert.deepEqual(f.notifications, [true], 'A provisional swipe must not resign input focus');
  const before = f.progress(); f.event('onStart', 1);
  assert.equal(f.progress(), before, 'Cancellation retains current geometry');
  f.event('onMove', .8); assert.equal(f.progress(), before, 'A released, cancelled gesture finishes with its spring');
  f.advance(.8); f.event('onEnd', 1); assert.equal(f.progress(), .8, 'No end-event snap');
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'open'); assert.equal(f.progress(), 1); assert.equal(f.completed(), 0);
});

test('upward keyboard release resumes on a fresh display frame, including an end-only cancellation', () => {
  for (const event of ['onStart', 'onEnd']) {
    const f = fixture(false, 'ios', true);
    f.open(); f.flush(); f.inputPrepared(); f.frame(); f.finishSpring();
    f.event('onStart', 1); f.event('onEnd', 1); f.flush();
    for (const p of [.8, .3, .4]) f.event('onInteractive', p);
    const count = f.springs.length, before = f.progress();
    f.event(event, 1);
    assert.equal(f.springs.length, count, 'Do not start a return spring with the native event timestamp');
    assert.equal(f.progress(), before, 'Keep the displayed width until the next display frame');
    f.event('onStart', 1); f.event('onMove', .9); f.event('onEnd', 1);
    f.frame();
    assert.equal(f.springs.length, count + 1, 'Duplicate show/end notifications schedule only one return');
    f.advance(.75); f.event('onEnd', 1); assert.equal(f.progress(), .75);
    f.finishSpring(); f.flush();
    assert.equal(f.progress(), 1); assert.equal(f.phase(), 'open');
    assert.deepEqual(f.notifications, [true]); assert.equal(f.completed(), 0);
  }
});

test('a second gesture or Back supersedes a queued keyboard return without a late expansion', () => {
  for (const interrupt of ['gesture', 'back', 'detach', 'reduce']) {
    const f = fixture(false, 'ios', true);
    f.open(); f.flush(); f.inputPrepared(); f.frame(); f.finishSpring();
    f.event('onStart', 1); f.event('onEnd', 1); f.flush();
    f.event('onInteractive', .4); f.event('onStart', 1);
    const count = f.springs.length;
    if (interrupt === 'gesture') {
      f.event('onInteractive', .3); f.event('onStart', 1);
      f.frame();
      assert.equal(f.springs.length, count + 1, 'Only the latest gesture may resume Search');
      f.finishSpring(); f.flush(); assert.equal(f.progress(), 1);
    } else if (interrupt === 'reduce') {
      f.reduce(true); f.frame();
      assert.equal(f.springs.length, count, 'Reduced motion invalidates the queued return');
      assert.equal(f.progress(), 1);
    } else {
      if (interrupt === 'back') { f.close(); f.flush(); f.event('onStart', 0); }
      else f.detach();
      f.frame();
      assert.equal(f.springs.at(-1).target, 0, 'The stale return cannot override dismissal');
      f.event('onEnd', 0); f.finishSpring(); f.flush();
      assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
    }
  }
});

test('committing a partial interactive drag closes Search from its displayed bounds', () => {
  const f = shown(); f.event('onInteractive', .6); const before = f.progress();
  f.event('onStart', 0); f.flush(); assert.equal(f.phase(), 'closing'); assert.equal(f.progress(), before);
  f.advance(.3); f.event('onMove', .5); assert.ok(Math.abs(f.progress() - .3) < 1e-8);
  f.event('onEnd', 0); f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
});

test('keyboard drags have no autonomous bounce and only a recent fast flick carries release velocity', () => {
  for(const [name,start,end,age,elastic] of [
    ['slow',.9,.88,10,false],['flick',.9,.55,10,true],['held after flick',.9,.55,250,false],
  ] as const) {
    const f=shown(), count=f.springs.length, now=Date.now();
    f.event('onInteractive',start,now-age-50);f.event('onInteractive',end,now-age);
    assert.equal(f.springs.length,count,name+': follow the held finger directly');
    f.event('onStart',0);
    const finish=f.springs.at(-1);
    assert.equal(finish.config.overshootClamping,!elastic,name);
    assert.ok(finish.config.velocity<=0&&finish.config.velocity>=-4);
    if(elastic)assert.ok(finish.config.velocity<=-1.5);
    assert.ok(Math.abs(f.progress()-end)<1e-8,'Release never snaps the displayed position');
  }
});

test('releasing a fully lowered keyboard releases Search even without native completion events', () => {
  for (const endpoint of [0, .006, .019]) {
    const f = shown(); f.event('onInteractive', .5); f.event('onInteractive', endpoint); f.flush();
    assert.equal(f.phase(), 'open', 'Reaching the bottom with the finger down must remain reversible');
    f.releaseGesture(); f.flush(); if (endpoint > .001) f.finishSpring(); f.flush();
    assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1); assert.equal(f.controlsReady(), true);
    assert.equal(f.origins.at(-1), 'command', 'The native input must also relinquish focus');
    f.releaseGesture(); f.native('onDidHide'); f.event('onEnd', 0); f.flush();
    assert.equal(f.completed(), 1);
    f.open(); f.flush(); f.finishSpring(); assert.equal(f.phase(), 'open');
  }
});

test('release fallback leaves partial and reversed keyboard drags to UIKit', () => {
  for (const endpoint of [.1, .7]) {
    const f = shown(); f.event('onInteractive', .01); f.event('onInteractive', endpoint);
    f.releaseGesture(); f.flush();
    assert.equal(f.phase(), 'open'); assert.deepEqual(f.origins, ['command']);
    f.event('onStart', 1); f.event('onEnd', 1); f.finishSpring(); f.flush();
    assert.equal(f.progress(), 1); assert.equal(f.completed(), 0);
  }
});

test('a fractional-zero native completion cannot strand the gesture overlay', () => {
  const f = shown(); f.event('onInteractive', .4); f.event('onEnd', .00001); f.flush();
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
});

test('an iOS willHide notification does not prevent cancelling the native gesture', () => {
  const f = shown(); f.event('onInteractive', .7); f.native('onWillHide'); f.flush();
  assert.equal(f.phase(), 'open', 'willHide alone cannot commit a finger-down gesture');
  f.event('onInteractive', .5); f.event('onStart', 1); f.event('onMove', .8); f.event('onEnd', 1); f.flush();
  assert.equal(f.phase(), 'open'); assert.equal(f.isOpen(), true); assert.equal(f.completed(), 0);
  assert.deepEqual(f.origins, ['command']);
});

test('UIKit can cancel an automatic close even after the short visual finish', () => {
  const f = shown(); f.event('onInteractive', .65); f.event('onStart', 0); f.flush();
  f.finishSpring(); assert.equal(f.progress(), 0); assert.equal(f.completed(), 0);
  f.event('onStart', 1); f.event('onMove', .8); f.event('onEnd', 1); f.finishSpring(); f.flush();
  assert.equal(f.phase(), 'open'); assert.equal(f.progress(), 1); assert.equal(f.completed(), 0);
});

test('a native hide completion releases an already settled morph without another animation', () => {
  const f = shown(); f.event('onInteractive', .5); f.event('onStart', 0); f.flush();
  f.finishSpring(); assert.equal(f.progress(), 0); const count = f.springs.length;
  f.event('onEnd', 0); f.native('onDidHide'); f.flush();
  assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1); assert.equal(f.springs.length, count);
});

test('iOS willHide fallback starts the reverse morph and duplicate notifications finish only once', () => {
  const f = shown(), count = f.springs.length;
  f.native('onWillHide'); f.flush(); assert.equal(f.phase(), 'closing');
  assert.equal(f.progress(), 1); assert.equal(f.springs.length, count + 1); assert.equal(f.springs.at(-1).target, 0);
  f.advance(.3); f.native('onDidHide'); f.native('onDidHide'); f.finishSpring(); f.flush();
  assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1); assert.deepEqual(f.notifications, [true, false]);
});

test('Android didHide-only dismissal cannot leave the field expanded', () => {
  const f = fixture(false, 'android'); f.open(); f.flush(); f.finishSpring(); f.native('onDidShow');
  f.native('onDidHide'); f.flush();
  assert.equal(f.phase(), 'closing'); assert.equal(f.progress(), 1, 'Fallback springs from actual bounds');
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
});

test('Back, Done and a hardware keyboard close through the same idempotent command', () => {
  const f = fixture(); assert.equal(f.open(), true); assert.equal(f.open(), false); f.flush(); f.finishSpring();
  assert.equal(f.close(), true); assert.equal(f.close(), false); f.flush();
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
  assert.deepEqual(f.origins, ['command', 'command']);
});

test('rapid reopen rejects old hide events, focus requests and spring completions', () => {
  const f = shown(); f.close(); f.flush(); f.native('onWillHide'); const old = f.springs.length - 1;
  f.set(.6); f.open(); f.event('onEnd', 0); f.native('onDidHide'); f.finishSpring(old); f.flush();
  assert.equal(f.progress(), .6); assert.equal(f.phase(), 'open'); assert.equal(f.completed(), 0);
  f.event('onStart', 1); f.event('onMove', .8); f.event('onEnd', 0); f.native('onDidHide'); f.flush();
  assert.ok(f.progress() >= .6); assert.equal(f.isOpen(), true);
  f.event('onEnd', 1); f.close(); f.flush(); f.event('onStart', 1);
  assert.equal(f.isOpen(), false, 'An obsolete show cannot reverse an explicit Back');
  f.event('onStart', 0); f.event('onMove', 0); f.event('onEnd', 0); f.finishSpring(); f.flush(); assert.equal(f.completed(), 1);
  assert.equal(keyboardMorphProgress(.7, .7, 1, .6), .6);
});

test('reduced motion, screen blur and unmount preserve completion ownership', () => {
  const f = fixture(); f.open(); f.set(.4); f.reduce(true); assert.equal(f.progress(), 1);
  f.close(); f.finishSpring(); f.flush(); assert.equal(f.progress(), 0); assert.equal(f.completed(), 1);
  f.reduce(false); f.open(); f.close(); f.detach(); f.finishSpring(); f.dispose(); f.flush();
  assert.equal(f.completed(), 1, 'No late focus or query updates after unmount');
});

test('manual dismissal during presentation also collapses a partially expanded field', () => {
  for (const interactive of [false, true]) {
    const f = fixture(); f.open(); f.set(.2); f.event('onStart', 1); f.event('onMove', .5);
    const before = f.progress();
    if (interactive) f.event('onInteractive', .3);
    else { f.event('onStart', 0); f.event('onMove', .3); }
    assert.ok(f.progress() <= before && f.progress() > 0, 'Continue from the displayed partial geometry');
    f.event('onEnd', 0); f.finishSpring(); f.flush(); assert.equal(f.progress(), 0);
    assert.equal(f.completed(), 1); assert.equal(f.phase(), 'closed');
  }
});

test('reduced motion does not create a phantom close at startup', () => {
  const f = fixture(true); f.flush(); assert.equal(f.completed(), 0);
  f.open(); f.flush(); f.finishSpring(); f.close(); f.flush(); f.finishSpring(); f.flush();
  assert.equal(f.completed(), 1); assert.equal(f.phase(), 'closed');
});

test('a detached screen ignores subsequent keyboard gestures', () => {
  const f = shown(); f.detach(); f.flush(); f.event('onInteractive', .4); f.event('onStart', 1);
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.isOpen(), false);
});

test('Back before the first keyboard frame cannot snap partially expanded geometry', () => {
  const f = fixture(); f.open(); f.flush(); f.set(.35); f.event('onStart', 1);
  f.close(); f.flush(); f.event('onStart', 0); f.event('onEnd', 0);
  assert.equal(f.progress(), .35, 'No keyboard movement must not snap the search surface');
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
});

test('reopen then immediate Back does not wait forever for the previous keyboard generation', () => {
  const f = shown(); f.close(); f.flush(); f.event('onStart', 0); f.event('onMove', .5);
  f.open(); f.close(); f.flush(); f.event('onEnd', 0); f.native('onDidHide');
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
  assert.equal(f.progress(), 0); assert.equal(f.isOpen(), false);
});
