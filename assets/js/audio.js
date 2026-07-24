"use strict";

/* ============================================================================
 * audio.js — sound effects played from bundled, recorded CC0 samples (Kenney
 * audio packs) via the Web Audio API, plus the background-music player. Samples
 * are decoded once into AudioBuffers and mapped to Gwent actions (play a unit,
 * summon weather, sound the horn, take/lose a round). The AudioContext is
 * created eagerly at load so it is
 * ready the instant the user first interacts — browsers still block *sound*
 * until that first gesture, but this way even the very first click plays. To play
 * through the hardware mute (ringer) switch on iOS instead of being silenced, the
 * page's audio session is declared as "playback" (Safari 16.4+); older Safari
 * falls back to rerouting the graph through an <audio> element / a looping silent
 * <audio> element. Respects the Sound-effects / Volume settings.
 * ==========================================================================*/

const Sfx = (function(){
  let ctx=null, master=null;

  // Effects sit under the same ceiling as the music bus (see MUSIC_CEILING in the
  // Music engine) so that, slider-for-slider, cues and music land at the same
  // loudness instead of the effects drowning out the background track.
  const SFX_CEILING=0.1;

  // Read prefs defensively — SETTINGS is defined in ui.js and may load later.
  function masterFactor(){ const v=(typeof SETTINGS!=="undefined"&&SETTINGS.masterVol!=null)?+SETTINGS.masterVol:1; return Math.max(0,Math.min(1,v)); }
  function vol(){ const v=(typeof SETTINGS!=="undefined" && SETTINGS.volume!=null)?+SETTINGS.volume:0.6; return Math.max(0,Math.min(1,v))*SFX_CEILING*masterFactor(); }
  function enabled(){ return vol()>0; }   // nothing to play once the effects/master sliders bottom out

  // The definitive iOS mute-switch bypass (Safari 16.4+): declare the page's
  // audio session as "playback", exactly like a music or video app. Once set,
  // ALL of the page's audio — Web Audio included — plays through the hardware mute
  // (ringer) switch instead of being silenced, with no rerouting needed. Just a
  // property assignment, so it is safe to call eagerly (before any gesture) and to
  // re-assert on each unlock; harmless no-op where the API is absent (older Safari,
  // other browsers), which then rely on the <audio>-element fallbacks below.
  function preferPlaybackSession(){
    try{
      const s = (typeof navigator!=="undefined") && navigator.audioSession;
      if(s && "type" in s){ s.type="playback"; return true; }
    }catch(e){}
    return false;
  }

  function ensure(){
    if(ctx) return ctx;
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      // Claim the playback session before the context exists, so the context is
      // created under it and is audible in silent mode from its very first sound.
      preferPlaybackSession();
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = vol();
      master.connect(ctx.destination);
      decodeAll();
    }catch(e){ ctx=null; master=null; }
    return ctx;
  }

  // iOS routes Web Audio through an audio session that is *silenced by the
  // hardware mute (ringer) switch*, so a pure Web Audio game goes quiet in silent
  // mode even after a gesture — unlike an HTMLMediaElement, whose playback ignores
  // the switch. Playing a looping, genuinely-silent <audio> element flips the
  // page's audio session to the media-playback category, after which our Web Audio
  // cues and music are audible in silent mode too. Created and (re)started inside
  // a user gesture via unlock(); kept looping thereafter.
  const SILENT_WAV="data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  let silentEl=null;
  function iosNeedsUnmute(){
    if(typeof navigator==="undefined") return false;
    const ua=navigator.userAgent||"";
    // iPhone/iPod/iPad, plus iPadOS which now reports as "MacIntel" with touch.
    return /iP(hone|od|ad)/.test(ua) || (navigator.platform==="MacIntel" && (navigator.maxTouchPoints||0)>1);
  }
  function keepSessionActive(){
    if(!iosNeedsUnmute()) return;
    try{
      if(!silentEl){
        silentEl=new Audio(SILENT_WAV);
        silentEl.loop=true;
        silentEl.preload="auto";
        silentEl.setAttribute("playsinline","");   // never take over the screen
        // Must stay UNMUTED for iOS to switch the audio session category; the
        // buffer is all-zero samples, so it is inaudible regardless of volume.
      }
      if(silentEl.paused){ const pr=silentEl.play(); if(pr&&pr.catch) pr.catch(()=>{}); }
    }catch(e){}
  }

  // The definitive iOS mute-switch bypass: route the WHOLE Web Audio graph out
  // through an <audio> element instead of straight to the speakers. Web Audio
  // played to ctx.destination obeys the ringer switch, but an HTMLMediaElement's
  // playback ignores it — so by piping the master bus into a MediaStream and
  // playing that stream from an <audio> element, every cue and the music become
  // audible in silent mode. Reroutes the SFX master and (via Music.rerouteTo) the
  // music bus onto the stream, so nothing is left on the muted speaker path.
  // Returns true when the routing is active; false if the browser can't do it
  // (older Safari), so unlock() can fall back to the silent-element trick.
  let streamDest=null, sinkEl=null;
  function routeThroughElement(){
    if(!iosNeedsUnmute() || !ctx || !master) return false;
    try{
      if(!streamDest){
        if(!ctx.createMediaStreamDestination) return false;
        const dest=ctx.createMediaStreamDestination();
        const el=new Audio();
        el.setAttribute("playsinline","");
        el.setAttribute("webkit-playsinline","");
        try{ el.srcObject=dest.stream; }
        catch(e){ try{ el.src=URL.createObjectURL(dest.stream); }catch(e2){ return false; } }
        // Move the SFX master and the music bus off the speakers and onto the stream.
        try{ master.disconnect(); }catch(e){}
        master.connect(dest);
        if(typeof Music!=="undefined" && Music.rerouteTo) Music.rerouteTo(dest);
        // Keep it playing across interruptions (a call, backgrounding, etc.).
        el.addEventListener("pause", ()=>{ const pr=el.play(); if(pr&&pr.catch) pr.catch(()=>{}); });
        streamDest=dest; sinkEl=el;
      }
      if(sinkEl && sinkEl.paused){ const pr=sinkEl.play(); if(pr&&pr.catch) pr.catch(()=>{}); }
      return true;
    }catch(e){
      // Anything went wrong — restore the direct speaker path so audio still works
      // (just subject to the mute switch) and let the caller use the fallback.
      try{ if(master){ master.disconnect(); master.connect(ctx.destination); } }catch(_){}
      streamDest=null; sinkEl=null;
      return false;
    }
  }

  // Kick the context alive on a user gesture (no-op once running). Also plays a
  // one-sample silent buffer, which is what actually unlocks audio on iOS, and
  // routes output through an <audio> element so Web Audio ignores the mute switch
  // (falling back to the silent-<audio> session trick if that isn't supported).
  function unlock(){
    const c=ensure(); if(!c) return;
    // Re-assert the playback session on the gesture: some Safari builds only honour
    // the assignment once there is a live, user-activated context to attach it to.
    preferPlaybackSession();
    if(c.state==="suspended"){
      try{ const p=c.resume(); if(p&&p.then) p.then(afterRunning, ()=>{}); }catch(e){}
    }
    try{ const b=c.createBufferSource(); b.buffer=c.createBuffer(1,1,c.sampleRate); b.connect(c.destination); b.start(0); }catch(e){}
    // Re-kick decoding now the context is active: any decode that stalled or failed
    // while the context was suspended (iOS) is retried here so samples become
    // playable. `force` re-attempts even samples whose earlier decode never settled.
    decodeAll(true);
    afterRunning();
  }
  // Set up the iOS mute-switch bypass, but only once the context is actually
  // running (i.e. a real gesture resumed it) — rerouting the master off the
  // speakers before then could leave the page silent until the next gesture. When
  // the graph-through-element routing isn't available, use the silent-element trick.
  function afterRunning(){
    if(!iosNeedsUnmute()) return;
    // With a real playback audio session, Web Audio already ignores the mute
    // switch — no need to reroute the graph off the speakers at all.
    if(preferPlaybackSession()) return;
    // Older Safari without navigator.audioSession: fall back to piping the graph
    // through an <audio> element, then to the looping-silent-element session trick.
    if(ctx && ctx.state==="running"){
      if(!routeThroughElement()) keepSessionActive();
    }else{
      keepSessionActive();
    }
  }

  // Re-apply the current volume to the live master gain.
  function setVolume(){ if(ctx && master){ try{ master.gain.setTargetAtTime(vol(), ctx.currentTime, 0.015); }catch(e){ master.gain.value=vol(); } } }

  // ---- Recorded-sample playback -------------------------------------------
  // Real one-shot samples (Kenney CC0 packs) are bundled as base64 data URIs in
  // window.GWENT_SFX (assets/js/sfx.js) and decoded once into AudioBuffers,
  // so cues are actual recordings rather than synthesised tones.
  const SAMPLES=Object.create(null);
  const decodingNames=Object.create(null);   // samples whose decode is in flight

  function b64ToBuf(uri){
    const b64=String(uri).split(",")[1]||"";
    const bin=atob(b64), n=bin.length, bytes=new Uint8Array(n);
    for(let i=0;i<n;i++) bytes[i]=bin.charCodeAt(i);
    return bytes.buffer;
  }
  // Decode every not-yet-decoded sample into an AudioBuffer. Safe to call more than
  // once: samples already decoded are always skipped. This matters on iOS, where
  // decodeAudioData kicked off before the first gesture can stall OR fail — so we
  // call this AGAIN from unlock() (with force) once the context is running, which
  // actually completes decoding. Without the retry, SAMPLES stays empty on iOS and
  // every cue silently no-ops. `force` re-attempts samples whose earlier decode is
  // still outstanding (a stalled iOS decode would otherwise block the retry).
  function decodeAll(force){
    if(!ctx) return;
    const src=(typeof window!=="undefined" && window.GWENT_SFX)||{};
    for(const name in src){
      if(SAMPLES[name]) continue;
      if(decodingNames[name] && !force) continue;
      let ab; try{ ab=b64ToBuf(src[name]); }catch(e){ continue; }
      decodingNames[name]=true;
      const store=(b)=>{ delete decodingNames[name]; if(b) SAMPLES[name]=b; };
      const fail=()=>{ delete decodingNames[name]; };
      try{
        const p=ctx.decodeAudioData(ab, store, fail);
        if(p && p.then) p.then(store, fail);
      }catch(e){ delete decodingNames[name]; }
    }
  }

  // Play a decoded sample: pitch via `rate`, level via `gain`, starting at `t0`.
  function playBuf(name,t0,o){
    o=o||{}; const buf=SAMPLES[name];
    // Not decoded yet (e.g. decoding still in flight): kick decoding if it hasn't
    // started and skip this one cue rather than throwing. The forced retry in
    // unlock() (run on every gesture) is what breaks a genuinely stalled iOS decode.
    if(!buf){ decodeAll(); return; }
    const s=ctx.createBufferSource(); s.buffer=buf;
    s.playbackRate.value=o.rate||1;
    const g=ctx.createGain(); g.gain.value=(o.gain!=null?o.gain:1);
    s.connect(g); g.connect(master);
    s.start(t0!=null?t0:ctx.currentTime+0.001);
    s.onended=()=>{ try{ s.disconnect(); g.disconnect(); }catch(e){} };
    return s;
  }

  // Per-colour gem pitch: one glass sample, gently shifted so each stone keeps
  // its own voice (darker lower, Gold brightest). A modest spread — wide pitch-
  // shifting a single sample sounds artificial, so we keep it subtle.
  // A tiny random detune (±1.5%) so repeated sounds feel organic, not identical.
  function detune(){ return 0.985+Math.random()*0.03; }
  // The two "lose" fanfares alternate on each defeat so it isn't the same flub twice.
  let loseAlt=0;

  // Named cues for Gwent, built from the same recorded sample set as Gilded
  // (Kenney foley/UI + trumpet flourishes) but mapped to card-game actions.
  const CUES={
    // a hand card selected (first tap) — a light paper flick
    select:(t)=>{ playBuf("cardSlide", t, {rate:1.14*detune(), gain:0.4}); },
    // a unit committed to a row — the card slapped down on the felt
    play:(t)=>{ playBuf("cardPlace", t, {rate:detune(), gain:0.85}); },
    // weather summoned — a low scoop that settles into gloom over the row
    weather:(t)=>{ playBuf("scoop", t, {rate:0.85, gain:0.6}); playBuf("settle", t+0.12, {rate:0.9, gain:0.5}); },
    // clear weather — a bright rising chime as the skies open
    clear:(t)=>{ playBuf("glass", t, {rate:1.12*detune(), gain:0.7}); playBuf("glass", t+0.09, {rate:1.3*detune(), gain:0.55}); },
    // Commander's Horn — a short, regal trumpet flourish
    horn:(t)=>{ playBuf("noble", t, {gain:0.85}); },
    // a spy planted in the enemy row, then cards drawn — a slide and a coin tick
    spy:(t)=>{ playBuf("cardSlide", t, {rate:0.95, gain:0.7}); playBuf("coins", t+0.12, {gain:0.4}); },
    // a medic revives a fallen unit — a two-note ascending shimmer
    medic:(t)=>{ playBuf("glass", t, {rate:1.0*detune(), gain:0.6}); playBuf("glass", t+0.09, {rate:1.18*detune(), gain:0.6}); },
    // a player passes for the round — a soft, low settle
    pass:(t)=>{ playBuf("settle", t, {rate:0.95, gain:0.5}); },
    // you take a round — a regal flourish (lighter than the match fanfare)
    roundWin:(t)=>{ playBuf("noble", t, {gain:0.8}); },
    // you drop a round — a deflating trumpet, alternating between two takes
    roundLose:(t)=>{ playBuf((loseAlt++ % 2) ? "loseB" : "loseA", t, {gain:0.7}); },
    // you win the match — a triumphant trumpet fanfare
    win:(t)=>{ playBuf("win", t, {gain:0.9}); },
    // you lose the match — a deflating trumpet
    lose:(t)=>{ playBuf((loseAlt++ % 2) ? "loseB" : "loseA", t, {gain:0.85}); },
    // soft, subtle UI tick for menu/header buttons
    click:(t)=>{ playBuf("click", t, {gain:0.5}); },
    // an invalid action
    error:(t)=>{ playBuf("error", t, {gain:0.6}); },
  };
  function cue(name,opts){
    if(!enabled()) return;
    const c=ensure(); if(!c) return;
    if(c.state==="suspended"){ try{ c.resume(); }catch(e){} }
    const fn=CUES[name]; if(fn){ try{ fn(c.currentTime+0.001, opts); }catch(e){} }
  }

  // Expose the shared AudioContext so the Music player can loop through the same
  // graph (one context avoids double audio-hardware init and lets a single
  // gesture unlock both effects and music).
  return { cue, unlock, setVolume, ensure, context:()=>ensure() };
})();

// Global convenience wrapper used across the game; never throws.
function sfx(name,opts){ try{ Sfx.cue(name,opts); }catch(e){} }

// Create the AudioContext eagerly (it starts suspended until a gesture), so the
// first sound isn't lost to context-startup latency. Harmless if unsupported.
try{ Sfx.ensure(); }catch(e){}

/* ---------------------------------------------------------------------------
 * Music — plays bundled, properly-licensed medieval folk *recordings* so the
 * game has a realistic acoustic soundtrack rather than synthesised tones. All
 * tracks are by Kevin MacLeod (incompetech.com), licensed CC BY 3.0 — see README
 * credits. There are two contexts, chosen with setMode():
 *   • "menu"  — "Lord of the Land" and "Village Consort" ALTERNATE, each playing
 *               through once and then crossfading (equal-power) into the other,
 *               so the front-of-house theme keeps evolving.
 *   • "game"  — "Folk Round" loops on its own. The track is pre-baked as a
 *               seamless loop (its tail crossfaded into its head), and it is
 *               played via an AudioBufferSourceNode with loop=true, so it repeats
 *               sample-accurately with NO gap or silence.
 * Switching modes crossfades from one context to the other. Everything runs on
 * the Web Audio API through the effects engine's shared AudioContext, works from
 * a plain file:// open, respects the Music volume slider, and only begins once
 * the player interacts (browser autoplay policy).
 * Public API: start / stop / setVolume / toggle / setMode.
 * ------------------------------------------------------------------------- */
const Music = (function(){
  // Hard ceiling on the actual playback volume: the Settings slider runs 0–100%
  // of THIS value, so even at 100% the music stays a comfortable background bed
  // rather than blasting at full scale. Tuned low so a mid-slider (50%) setting
  // lands at a gentle listening level, leaving fine control across the range.
  const MUSIC_CEILING=0.1;
  const XFADE=6.0;                    // long crossfade (s) between the two MENU tracks
  const MODE_FADE=1.5;                // quick fade (s) when switching menu <-> game
  const GAME_MUSIC_SCALE=0.5;         // in a match, music sits at 50% of the menu level so cues cut through

  let ctx=null, out=null;             // shared context + dedicated music-volume gain
  let on=false;                       // playback wanted AND kicked off (post-gesture)
  let starting=false;                 // guards the async first-start
  let mode="menu";                    // desired context: "menu" | "game"
  let cur=null;                       // current foreground voice {s,g,key}
  let outgoing=null;                  // menu voice currently fading out (during a menu crossfade)
  let menuIdx=0;                      // which menu track is current (0 or 1)
  let xfTimer=null;                   // scheduled next menu crossfade
  let gen=0;                          // playback-intent token: only the latest begin* may spawn a voice

  const BUF=Object.create(null);      // decoded AudioBuffers by key: menu0/menu1/game
  const DECODING=Object.create(null);

  // Equal-power crossfade curves (constant perceived loudness through the blend).
  const NPTS=64, EP_IN=new Float32Array(NPTS), EP_OUT=new Float32Array(NPTS);
  for(let i=0;i<NPTS;i++){ const t=i/(NPTS-1); EP_IN[i]=Math.sin(t*Math.PI/2); EP_OUT[i]=Math.cos(t*Math.PI/2); }

  function masterFactor(){ const v=(typeof SETTINGS!=="undefined"&&SETTINGS.masterVol!=null)?+SETTINGS.masterVol:1; return Math.max(0,Math.min(1,v)); }
  function mvol(){ const v=(typeof SETTINGS!=="undefined"&&SETTINGS.musicVol!=null)?+SETTINGS.musicVol:0.5; return Math.max(0,Math.min(1,v))*MUSIC_CEILING*masterFactor(); }
  function modeScale(){ return mode==="game" ? GAME_MUSIC_SCALE : 1; }
  function targetOut(){ return mvol()*modeScale(); }   // effective music-bus level for the current context
  function wanted(){ return true; }    // music has no on/off toggle; the Music slider at 0 silences it

  // Tracks are bundled as inline base64 data URIs in window.GWENT_MUSIC
  // (assets/js/music.js: { menu:[lord,village], game:folk }), which load even
  // from a file:// page where browsers refuse separate audio subresources.
  function sources(){ return (typeof window!=="undefined" && window.GWENT_MUSIC) || {}; }
  function uriFor(key){
    const s=sources();
    if(key==="game") return s.game||"";
    if(key==="menu0") return (s.menu&&s.menu[0])||"";
    if(key==="menu1") return (s.menu&&s.menu[1])||"";
    return "";
  }
  function b64ToBuf(uri){
    const b64=String(uri).split(",")[1]||"";
    const bin=atob(b64), n=bin.length, bytes=new Uint8Array(n);
    for(let i=0;i<n;i++) bytes[i]=bin.charCodeAt(i);
    return bytes.buffer;
  }

  // Borrow the effects engine's AudioContext and hang a dedicated gain node off
  // it for the Music volume (kept separate from the SFX master so the two
  // sliders are independent). `sinkNode` is normally null (out -> speakers); on
  // iOS the Sfx engine reroutes us onto its <audio>-element MediaStream via
  // rerouteTo() so music also plays through the mute switch.
  let sinkNode=null;
  function ensureCtx(){
    if(!ctx) ctx = (typeof Sfx!=="undefined" && Sfx.context && Sfx.context()) || null;
    if(ctx && !out){ out=ctx.createGain(); out.gain.value=targetOut(); out.connect(sinkNode||ctx.destination); }
    return ctx;
  }
  // Send the music bus to `node` instead of the speakers (used for the iOS
  // mute-switch bypass). Remembered so a not-yet-created `out` also uses it.
  function rerouteTo(node){
    sinkNode=node||null;
    if(out){ try{ out.disconnect(); }catch(e){} try{ out.connect(sinkNode||ctx.destination); }catch(e){} }
  }

  // Decode a single track (idempotent, cached). decodeAudioData works while the
  // context is still suspended, so this can run before the first gesture.
  function ensureBuf(key, cb){
    if(BUF[key]){ if(cb) cb(BUF[key]); return; }
    const c=ensureCtx(); if(!c) return;
    if(DECODING[key]){ DECODING[key].push(cb); return; }
    DECODING[key]=[cb];
    let ab; try{ ab=b64ToBuf(uriFor(key)); }catch(e){ DECODING[key]=null; return; }
    const done=(b)=>{ if(b) BUF[key]=b; const q=DECODING[key]||[]; DECODING[key]=null; q.forEach(fn=>{ if(fn&&b) fn(b); }); };
    try{ const p=c.decodeAudioData(ab, done, ()=>done(null)); if(p&&p.then) p.then(done, ()=>done(null)); }
    catch(e){ done(null); }
  }

  // Build a voice (buffer source + its own gain) wired to the music-volume node.
  function mkVoice(buf, loop){
    const g=ctx.createGain(); g.connect(out);
    const s=ctx.createBufferSource(); s.buffer=buf; s.loop=!!loop; s.connect(g);
    return { s, g };
  }
  function fadeIn(v, t0, dur){ dur=dur||XFADE; try{ v.g.gain.setValueCurveAtTime(EP_IN, t0, dur); }catch(e){ try{ v.g.gain.setValueAtTime(1,t0); }catch(_){} } }
  function fullGain(v, t0){ try{ v.g.gain.setValueAtTime(1, t0); }catch(e){} }
  // Fade a voice out from `when` over `dur` seconds and stop it once silent.
  // Handles a voice caught mid fade-in (cancel + hold the live value, then ramp).
  function killVoice(v, when, dur){
    if(!v) return; dur=dur||XFADE; const s=v.s, g=v.g.gain;
    try{
      g.cancelScheduledValues(when);
      if(g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(when); else g.setValueAtTime(g.value, when);
      g.linearRampToValueAtTime(0.0001, when+dur);
    }catch(e){}
    try{ s.stop(when+dur+0.05); }catch(e){}
    try{ s.onended=()=>{ try{ s.disconnect(); v.g.disconnect(); }catch(e){} }; }catch(e){}
  }

  // ---- menu context: alternate menu0 <-> menu1, crossfading at each end ------
  function beginMenu(when, doFade, fade){
    const myGen=++gen;                 // supersede any earlier, still-pending begin*
    const key="menu"+menuIdx;
    ensureBuf(key, (buf)=>{
      if(myGen!==gen || mode!=="menu" || !on || !buf) return;  // a newer intent won — abort
      const t0=Math.max(when, ctx.currentTime+0.02);
      const v=mkVoice(buf, false); v.key=key;
      if(doFade) fadeIn(v, t0, fade); else fullGain(v, t0);
      try{ v.s.start(t0); }catch(e){}
      v.s.onended=(function(vv){ return ()=>{ try{ vv.s.disconnect(); vv.g.disconnect(); }catch(e){} }; })(v);
      cur=v;
      scheduleMenuCross(v, t0 + buf.duration - XFADE);
      // Warm the OTHER menu track and the in-game track so their crossfades-in
      // are instant (no decode latency at a track boundary or when a match starts).
      ensureBuf("menu"+(menuIdx^1));
      ensureBuf("game");
    });
  }
  function scheduleMenuCross(voice, xfAt){
    clearTimeout(xfTimer);
    const delay=Math.max(0, (xfAt - ctx.currentTime - 0.25)*1000);
    xfTimer=setTimeout(()=>{
      if(mode!=="menu" || !on || cur!==voice) return;
      const when=Math.max(ctx.currentTime, xfAt);
      outgoing=voice;                 // track it so a mode switch can cut it fast too
      try{ voice.g.gain.setValueCurveAtTime(EP_OUT, when, XFADE); }catch(e){ killVoice(voice, when); }
      try{ voice.s.stop(when+XFADE+0.05); }catch(e){}
      try{ voice.s.addEventListener("ended", ()=>{ if(outgoing===voice) outgoing=null; }); }catch(e){}
      menuIdx^=1;
      beginMenu(when, true);
    }, delay);
  }

  // ---- game context: Folk Round looping seamlessly on its own -----------------
  function beginGame(when, doFade, fade){
    const myGen=++gen;
    ensureBuf("game", (buf)=>{
      if(myGen!==gen || mode!=="game" || !on || !buf) return;
      const t0=Math.max(when, ctx.currentTime+0.02);
      const v=mkVoice(buf, true); v.key="game";
      if(doFade) fadeIn(v, t0, fade); else fullGain(v, t0);
      try{ v.s.start(t0); }catch(e){}
      cur=v;
    });
  }

  function beginCurrent(when, doFade, fade){
    if(mode==="game") beginGame(when, doFade, fade); else beginMenu(when, doFade, fade);
  }

  function start(){
    if(!wanted() || on || starting) return;
    const c=ensureCtx(); if(!c) return;
    starting=true; on=true;
    if(c.state==="suspended"){ try{ c.resume(); }catch(e){} }
    beginCurrent(c.currentTime+0.03, true, MODE_FADE);
    starting=false;
  }
  function stop(){
    on=false; clearTimeout(xfTimer); xfTimer=null;
    if(ctx && cur) killVoice(cur, ctx.currentTime, MODE_FADE); else if(cur){ try{ cur.s.stop(); }catch(e){} }
    if(ctx && outgoing) killVoice(outgoing, ctx.currentTime, MODE_FADE);
    cur=null; outgoing=null;
  }
  function setVolume(){ if(out && ctx){ try{ out.gain.setTargetAtTime(targetOut(), ctx.currentTime, 0.02); }catch(e){ out.gain.value=targetOut(); } } }
  function toggle(){ if(wanted()) start(); else stop(); }

  // Switch the playing context; crossfades if music is already running.
  function setMode(m){
    if(m!=="menu" && m!=="game") return;
    if(m===mode && (cur || !on)) { mode=m; return; }
    mode=m;
    clearTimeout(xfTimer); xfTimer=null;
    if(!on) return;                     // not started yet — start() will honour `mode`
    const c=ensureCtx(); if(!c) return;
    const when=c.currentTime+0.03;
    // Ease the whole music bus to the new context's level (game = 50% of menu)
    // over the same window as the voice crossfade, so the change is smooth.
    if(out){ try{
      out.gain.cancelScheduledValues(when);
      if(out.gain.cancelAndHoldAtTime) out.gain.cancelAndHoldAtTime(when); else out.gain.setValueAtTime(out.gain.value, when);
      out.gain.linearRampToValueAtTime(targetOut(), when+MODE_FADE);
    }catch(e){ try{ out.gain.value=targetOut(); }catch(_){} } }
    const prev=cur; cur=null;
    killVoice(prev, when, MODE_FADE);
    if(outgoing){ killVoice(outgoing, when, MODE_FADE); outgoing=null; }  // cut a menu crossfade-in-progress
    beginCurrent(when, true, MODE_FADE);
  }

  return { start, stop, setVolume, toggle, setMode, rerouteTo };
})();
