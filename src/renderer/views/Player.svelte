<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte'

  import Icon from '../components/Icon.svelte'
  import { back, buildShows, episodeLabel, episodeName, go, refresh, thumbUrl, ui, videoUrl } from '../lib/state.svelte.ts'
  import { cycleTrack, formatTime, isFinished, isTextEntry, resumePosition } from '../../shared/playback.ts'
  import { activeCues, parseSubtitle, type Cue } from '../../shared/subtitles.ts'

  import type { LoadedSubtitle } from '../../shared/types.ts'

  interface Track { id: string, label: string, language: string, load: () => Promise<LoadedSubtitle | null> }

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
  const END_WAIT = 8

  let { id }: { id: string } = $props()

  const episode = $derived(ui.library?.episodes.find(entry => entry.id === id))
  const siblings = $derived(episode ? buildShows(ui.library!.episodes).find(show => show.id === episode.showId)?.episodes ?? [] : [])
  const index = $derived(siblings.findIndex(entry => entry.id === id))
  const nextEpisode = $derived(siblings[index + 1])
  const prevEpisode = $derived(index > 0 ? siblings[index - 1] : undefined)

  let video = $state<HTMLVideoElement>()
  let stage = $state<HTMLDivElement>()
  let ready = $state(false)
  let paused = $state(true)
  let ended = $state(false)
  let seeking = $state(false)
  let time = $state(0)
  let duration = $state(0)
  let buffered = $state(0)
  let volume = $state(ui.library?.settings.volume ?? 1)
  let muted = $state(false)
  let speed = $state(1)
  let failure = $state('')
  let idle = $state(false)
  let menu = $state<'subs' | 'speed' | 'audio' | null>(null)
  let fullscreen = $state(false)
  let osd = $state('')
  let hover = $state<{ x: number, time: number } | null>(null)
  let scrubbing = $state(false)

  let tracks = $state<Track[]>([])
  let current = $state<string | null>(null)
  let cues = $state<Cue[]>([])
  let delay = $state(0)
  let scale = $state(ui.library?.settings.subtitleScale ?? 1)
  let audio = $state<Array<{ index: number, label: string, enabled: boolean }>>([])
  let box = $state({ width: 0, height: 0 })
  let countdown = $state(0)

  const shown = $derived(activeCues(cues, time - delay))
  const percent = $derived(duration ? time / duration * 100 : 0)
  const controls = $derived(!idle || paused || !!menu || scrubbing)
  const pauseCard = $derived(ready && paused && !ended && !seeking && !scrubbing && !failure)

  function progress () {
    return video && ready && episode ? { id: episode.id, position: video.currentTime, duration: video.duration || duration } : null
  }
  // the page's copy of the library has to agree with what was just saved, or reopening would resume from an old spot
  function remember (update: { id: string, position: number, duration: number }) {
    const entry = ui.library?.episodes.find(item => item.id === update.id)
    if (!entry) return
    entry.position = update.position
    entry.duration = update.duration
    entry.lastPlayed = Date.now()
    if (isFinished(update.position, update.duration)) entry.watched = true
  }
  function savePosition () {
    const update = progress()
    if (!update) return
    remember(update)
    window.navi.saveProgressNow($state.snapshot(update))
  }
  const saver = setInterval(() => {
    const update = progress()
    if (!update || video?.paused || video?.seeking) return
    remember(update)
    window.navi.sendProgress(update)
  }, 1000)
  onDestroy(() => { clearInterval(saver); clearInterval(endTimer); clearTimeout(idleTimer); clearTimeout(osdTimer); savePosition(); void refresh() })

  function onMeta () {
    if (!video || !episode) return
    duration = video.duration
    video.currentTime = resumePosition(episode.position, video.duration)
    video.playbackRate = speed
    readAudio()
  }
  function onCanPlay () {
    if (!video || ready) return
    ready = true
    void video.play().catch(() => undefined)
  }
  function onError () {
    const code = video?.error?.code
    failure = code === 4 ? 'Windows cannot decode this file’s video or audio format.' : 'This file could not be read. It may have moved or be damaged.'
  }
  function onProgress () {
    if (!video?.buffered.length) return
    for (let i = video.buffered.length - 1; i >= 0; i--) {
      if (video.buffered.start(i) <= video.currentTime) { buffered = video.buffered.end(i); return }
    }
  }

  function flash (text: string) {
    osd = text
    clearTimeout(osdTimer)
    osdTimer = setTimeout(() => { osd = '' }, 1100)
  }
  let osdTimer: ReturnType<typeof setTimeout> | undefined

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  function wake () {
    idle = false
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { idle = true }, 2800)
  }
  onMount(wake)

  const toggle = () => {
    if (!video) return
    if (ended) { seek(0); void video.play(); return }
    if (video.paused) void video.play(); else video.pause()
  }
  function seek (to: number) {
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration || 0, to))
    time = video.currentTime
  }
  function setVolume (value: number) {
    if (!video) return
    video.volume = volume = Math.max(0, Math.min(1, value))
    video.muted = muted = false
    flash(`Volume ${Math.round(volume * 100)}%`)
    void window.navi.setSettings({ volume })
  }
  function setSpeed (value: number) {
    speed = value
    if (video) video.playbackRate = value
    flash(`${value}×`)
  }
  function stepSpeed (direction: 1 | -1) {
    setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + direction))] ?? 1)
  }
  async function toggleFullscreen () {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await stage?.requestFullscreen()
  }
  async function togglePip () {
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    else await video?.requestPictureInPicture().catch(() => flash('Picture in picture is unavailable'))
  }

  // subtitles
  async function loadTracks () {
    const target = untrack(() => episode)
    if (!target) return
    const found: Track[] = target.sidecars.map(sidecar => ({
      id: sidecar.id,
      label: sidecar.label,
      language: sidecar.language,
      load: () => window.navi.readSidecar(target.id, sidecar.id)
    }))
    tracks = found
    chooseInitial(found)
    const embedded = await window.navi.embeddedSubtitles(target.id)
    if (target.id !== id || !embedded.length) return
    const inside: Track[] = embedded.map(entry => ({
      id: `embedded:${entry.track}`,
      label: entry.label,
      language: entry.language,
      load: async () => ({ label: entry.label, format: entry.format, text: entry.text })
    }))
    tracks = [...tracks, ...inside]
    if (current === null) chooseInitial(tracks)
  }

  function chooseInitial (list: Track[]) {
    const saved = episode?.subtitleChoice
    if (saved === 'off') return
    const wanted = ui.library?.settings.subtitleLanguage
    const pick = list.find(track => track.id === saved) ?? (wanted ? list.find(track => track.language === wanted) : undefined) ?? list[0]
    if (pick) void selectTrack(pick.id, false)
  }

  async function selectTrack (trackId: string | null, remember = true) {
    current = trackId
    cues = []
    if (remember && episode) void window.navi.setSubtitleChoice(episode.id, trackId ?? 'off')
    const track = tracks.find(entry => entry.id === trackId)
    if (!track) return
    const loaded = await track.load()
    if (current !== trackId) return
    cues = loaded ? parseSubtitle(loaded.text, loaded.format) : []
    if (!cues.length && remember) flash('This subtitle track has no readable text')
  }

  function cycleSubtitles (direction: 1 | -1) {
    const nextId = cycleTrack(tracks.map(track => track.id), current, direction)
    void selectTrack(nextId)
    flash(`Subtitles: ${tracks.find(track => track.id === nextId)?.label ?? 'Off'}`)
  }

  async function loadSubtitleFile () {
    const loaded = await window.navi.pickSubtitle()
    if (!loaded) return
    const track: Track = { id: `manual:${Date.now()}`, label: loaded.label, language: '', load: async () => loaded }
    tracks = [...tracks, track]
    await selectTrack(track.id, false)
  }

  function nudgeDelay (amount: number) {
    delay = Math.round((delay + amount) * 10) / 10
    flash(`Subtitle delay ${delay > 0 ? '+' : ''}${delay.toFixed(1)}s`)
  }
  function nudgeScale (amount: number) {
    scale = Math.max(0.6, Math.min(2, Math.round((scale + amount) * 10) / 10))
    flash(`Subtitle size ${Math.round(scale * 100)}%`)
    void window.navi.setSettings({ subtitleScale: scale })
  }

  function readAudio () {
    const list = video?.audioTracks
    if (!list) return
    audio = Array.from({ length: list.length }, (_, i) => ({ index: i, label: list[i]?.label || list[i]?.language?.toUpperCase() || `Track ${i + 1}`, enabled: !!list[i]?.enabled }))
  }
  function selectAudio (target: number) {
    const list = video?.audioTracks
    if (!list || !video) return
    const at = video.currentTime
    for (let i = 0; i < list.length; i++) { const entry = list[i]; if (entry) entry.enabled = i === target }
    video.currentTime = at
    readAudio()
    flash(`Audio: ${audio[target]?.label}`)
  }
  function cycleAudio () {
    if (audio.length < 2) return
    selectAudio((audio.findIndex(entry => entry.enabled) + 1) % audio.length)
  }

  // next episode
  let endTimer: ReturnType<typeof setInterval> | undefined
  function stopCountdown () {
    clearInterval(endTimer)
    endTimer = undefined
    countdown = 0
  }
  function onEnded () {
    ended = true
    savePosition()
    if (!nextEpisode || !ui.library?.settings.autoplayNext) return
    countdown = END_WAIT
    endTimer = setInterval(() => {
      countdown -= 1
      if (countdown <= 0) playNext()
    }, 1000)
  }
  function playNext () {
    stopCountdown()
    savePosition()
    if (nextEpisode) go({ name: 'player', id: nextEpisode.id })
  }
  function playPrevious () {
    savePosition()
    if (prevEpisode) go({ name: 'player', id: prevEpisode.id })
  }

  function leave () {
    savePosition()
    if (document.fullscreenElement) void document.exitFullscreen()
    back()
  }

  function onKey (event: KeyboardEvent) {
    if (isTextEntry(event.target as HTMLElement) || ui.palette || ui.help || event.ctrlKey || event.altKey || event.metaKey) return
    const step = ui.library?.settings.seekStep ?? 10
    const actions: Record<string, () => void> = {
      Space: toggle,
      KeyK: toggle,
      ArrowLeft: () => seek(time - step),
      ArrowRight: () => seek(time + step),
      KeyJ: () => seek(time - 10),
      KeyL: () => seek(time + 10),
      ArrowUp: () => setVolume(volume + 0.05),
      ArrowDown: () => setVolume(volume - 0.05),
      KeyM: () => { if (video) { video.muted = muted = !muted; flash(muted ? 'Muted' : 'Sound on') } },
      KeyF: () => void toggleFullscreen(),
      KeyI: () => void togglePip(),
      KeyC: () => cycleSubtitles(event.shiftKey ? -1 : 1),
      KeyA: cycleAudio,
      BracketLeft: () => nudgeDelay(-0.1),
      BracketRight: () => nudgeDelay(0.1),
      Minus: () => nudgeScale(-0.1),
      Equal: () => nudgeScale(0.1),
      Comma: () => stepSpeed(-1),
      Period: () => stepSpeed(1),
      KeyN: () => { if (nextEpisode) playNext() },
      KeyP: playPrevious,
      Home: () => seek(0),
      End: () => seek(duration - 1)
    }
    if (event.code === 'Escape') {
      if (ui.help) return
      event.preventDefault()
      if (menu) menu = null
      else if (document.fullscreenElement) void document.exitFullscreen()
      else leave()
      return
    }
    const digit = event.code.match(/^(?:Digit|Numpad)(\d)$/)
    if (digit) { seek(duration * Number(digit[1]) / 10); wake(); return }
    const action = actions[event.code]
    if (!action) return
    event.preventDefault()
    action()
    wake()
  }

  function scrubAt (event: PointerEvent, bar: HTMLElement) {
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    hover = { x: ratio * 100, time: ratio * duration }
    return ratio * duration
  }

  function measure () {
    if (!stage || !video?.videoWidth) { if (stage) box = { width: stage.clientWidth, height: stage.clientHeight }; return }
    const fit = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight)
    box = { width: video.videoWidth * fit, height: video.videoHeight * fit }
  }
  onMount(() => {
    const observer = new ResizeObserver(measure)
    if (stage) observer.observe(stage)
    const onFull = () => { fullscreen = !!document.fullscreenElement }
    document.addEventListener('fullscreenchange', onFull)
    window.addEventListener('beforeunload', savePosition)
    return () => {
      observer.disconnect()
      document.removeEventListener('fullscreenchange', onFull)
      window.removeEventListener('beforeunload', savePosition)
    }
  })

  $effect(() => {
    void id
    untrack(() => {
      stopCountdown()
      ready = ended = false
      failure = ''
      tracks = []
      cues = []
      current = null
      delay = 0
      void loadTracks()
    })
  })
  $effect(() => { if (video) video.volume = untrack(() => volume) })

  function cueStyle (cue: Cue) {
    const column = (cue.align - 1) % 3
    const row = Math.floor((cue.align - 1) / 3)
    const size = `calc(${box.height / 100 * 4.6 * scale * cue.scale}px)`
    const base = `font-size:${size};${cue.color ? `color:${cue.color};` : ''}${cue.font ? `font-family:'${cue.font.replace(/['"\\;]/g, '')}',var(--ui);` : ''}`
    if (cue.position) return `${base}position:absolute;left:${cue.position.x}%;top:${cue.position.y}%;transform:translate(${[0, -50, -100][column]}%,${[-100, -50, 0][row]}%);`
    return `${base}align-self:${['flex-start', 'center', 'flex-end'][column]};text-align:${['left', 'center', 'right'][column]};`
  }
  const rows = $derived([7, 4, 1].map(start => shown.filter(cue => !cue.position && cue.align >= start && cue.align < start + 3)))
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="stage" class:bare={!controls} bind:this={stage} onpointermove={wake} onpointerdown={wake}>
  {#key id}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} src={videoUrl(id)} crossorigin="anonymous" preload="auto"
      bind:currentTime={time} bind:paused
      onloadedmetadata={() => { onMeta(); measure() }} oncanplay={onCanPlay} onprogress={onProgress} ontimeupdate={onProgress}
      onseeking={() => { seeking = true }} onseeked={() => { seeking = false; savePosition() }}
      onpause={() => { if (!video?.ended) savePosition() }} onplay={() => { ended = false; stopCountdown() }}
      onended={onEnded} onerror={onError} onclick={() => { if (menu) menu = null; else toggle() }} ondblclick={toggleFullscreen}></video>
  {/key}

  <div class="sublayer" class:raised={controls} style:width="{box.width}px" style:height="{box.height}px" aria-live="off">
    {#each rows as row, r (r)}
      <div class="subrow" style:justify-content={['flex-start', 'center', 'flex-end'][r]}>
        {#each row as cue, c (c)}
          <p class="cue" dir="auto" style={cueStyle(cue)}>{#each cue.lines as line, l (l)}<span class="ln">{#each line as part, p (p)}<span style:font-weight={part.bold ? 700 : null} style:font-style={part.italic ? 'italic' : null} style:text-decoration={part.underline ? 'underline' : null} style:color={part.color}>{part.text}</span>{/each}</span>{/each}</p>
        {/each}
      </div>
    {/each}
    {#each shown.filter(cue => cue.position) as cue, c (c)}
      <p class="cue" dir="auto" style={cueStyle(cue)}>{#each cue.lines as line, l (l)}<span class="ln">{#each line as part, p (p)}<span style:color={part.color}>{part.text}</span>{/each}</span>{/each}</p>
    {/each}
  </div>

  {#if !ready && !failure}<div class="spin" role="status" aria-label="Loading"></div>{/if}
  {#if osd}<div class="osd" role="status">{osd}</div>{/if}

  {#if episode}
    {#if pauseCard}
      <div class="pz-fade"></div>
      <section class="pz">
        <span class="tag ac">{episodeLabel(episode)}</span>
        <h1>{episodeName(episode)}</h1>
        <p class="lbl">{episode.show}</p>
        <div class="stats num"><div><b>{formatTime(time)}</b><span>Watched</span></div><div><b>{formatTime(duration - time)}</b><span>Left</span></div></div>
        <div class="row">
          <button class="btn white" onclick={toggle}><Icon name="play" />Resume</button>
          <button class="btn glass" onclick={() => seek(0)}><Icon name="replay" />Start over</button>
        </div>
        <span class="hint">Press <kbd>Space</kbd> to keep watching</span>
      </section>
    {/if}

    {#if ended}
      <section class="end">
        <div class="dots"></div>
        {#if nextEpisode}
          <div class="end-l">
            {#if countdown}
              <span class="lbl">Up next in</span>
              <div class="ring"><svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="100" /><circle class="v" cx="110" cy="110" r="100" stroke-dasharray={2 * Math.PI * 100} stroke-dashoffset={2 * Math.PI * 100 * (1 - countdown / END_WAIT)} /></svg><b class="num">{countdown}</b></div>
            {:else}
              <span class="lbl">{episodeLabel(episode)} finished</span>
            {/if}
            <div class="row">
              <button class="btn white" onclick={playNext}><Icon name="play" />Play now</button>
              {#if countdown}<button class="btn glass" onclick={stopCountdown}>Cancel</button>{:else}<button class="btn glass" onclick={toggle}><Icon name="replay" />Watch again</button>{/if}
            </div>
            <span class="saved"><i></i>Progress saved</span>
          </div>
          <div class="end-r">
            <button class="end-art" onclick={playNext} aria-label="Play {episodeName(nextEpisode)}">
              {#if thumbUrl(nextEpisode)}<img class="art" src={thumbUrl(nextEpisode)} alt="" />{:else}<div class="art-empty"></div>{/if}
              <b class="num">{nextEpisode.episode === null ? '' : String(nextEpisode.episode).padStart(2, '0')}</b>
            </button>
            <span class="tag ac">{episodeLabel(nextEpisode)}</span>
            <h2>{episodeName(nextEpisode)}</h2>
          </div>
        {:else}
          <div class="done"><span class="lbl">{episode.show}</span><h2 class="mega">All caught up</h2><div class="row"><button class="btn white" onclick={leave}>Back to library</button><button class="btn glass" onclick={toggle}><Icon name="replay" />Watch again</button></div></div>
        {/if}
      </section>
    {/if}

    <header class="ptop" class:hide={!controls}>
      <button class="sq" aria-label="Back" onclick={leave}><Icon name="back" /></button>
      <div class="min"><span class="lbl ell">{episode.show}</span><b class="ell">{episode.episode === null ? episode.show : `${episodeLabel(episode)} · ${episodeName(episode)}`}</b></div>
    </header>

    <footer class="pbot" class:hide={!controls}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="seek" role="slider" tabindex="-1" aria-label="Seek" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time}
        onpointerenter={event => scrubAt(event, event.currentTarget)}
        onpointermove={event => { const to = scrubAt(event, event.currentTarget); if (scrubbing) seek(to) }}
        onpointerleave={() => { if (!scrubbing) hover = null }}
        onpointerdown={event => { event.currentTarget.setPointerCapture(event.pointerId); scrubbing = true; seek(scrubAt(event, event.currentTarget)) }}
        onpointerup={() => { scrubbing = false; hover = null; savePosition() }}>
        <div class="track"><i class="buf" style:width="{duration ? buffered / duration * 100 : 0}%"></i><i class="val" style:width="{percent}%"></i></div>
        <i class="knob" style:left="{percent}%"></i>
        {#if hover}<span class="tip num" style:left="{hover.x}%">{formatTime(hover.time)}</span>{/if}
      </div>
      <div class="bar-row">
        <button class="pp" aria-label={paused ? 'Play' : 'Pause'} onclick={toggle}><Icon name={paused ? 'play' : 'pause'} size={26} /></button>
        <button class="ic" aria-label="Previous episode" disabled={!prevEpisode} onclick={playPrevious}><Icon name="prev" /></button>
        <button class="ic" aria-label="Next episode" disabled={!nextEpisode} onclick={playNext}><Icon name="next" /></button>
        <span class="time num"><b>{formatTime(time)}</b> / {formatTime(duration)}</span>
        <div class="grow"></div>
        <button class="ic" aria-label={muted ? 'Unmute' : 'Mute'} onclick={() => { if (video) video.muted = muted = !muted }}><Icon name={muted || volume === 0 ? 'mute' : 'volume'} /></button>
        <input class="vol" type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} aria-label="Volume" oninput={event => setVolume(Number(event.currentTarget.value))} />
        <div class="anchor">
          <button class="ic txt num" aria-label="Playback speed" aria-expanded={menu === 'speed'} onclick={() => { menu = menu === 'speed' ? null : 'speed' }}>{speed}×</button>
          {#if menu === 'speed'}
            <div class="pop" role="menu"><span class="lbl">Speed</span>{#each SPEEDS as value (value)}<button role="menuitemradio" aria-checked={value === speed} class:on={value === speed} onclick={() => { setSpeed(value); menu = null }}>{value}×</button>{/each}</div>
          {/if}
        </div>
        {#if audio.length > 1}
          <div class="anchor">
            <button class="ic" aria-label="Audio track" aria-expanded={menu === 'audio'} onclick={() => { readAudio(); menu = menu === 'audio' ? null : 'audio' }}><Icon name="audio" /></button>
            {#if menu === 'audio'}
              <div class="pop" role="menu"><span class="lbl">Audio</span>{#each audio as entry (entry.index)}<button role="menuitemradio" aria-checked={entry.enabled} class:on={entry.enabled} onclick={() => { selectAudio(entry.index); menu = null }}>{entry.label}</button>{/each}</div>
            {/if}
          </div>
        {/if}
        <div class="anchor">
          <button class="ic" class:lit={current !== null} aria-label="Subtitles" aria-expanded={menu === 'subs'} onclick={() => { menu = menu === 'subs' ? null : 'subs' }}><Icon name="subs" /></button>
          {#if menu === 'subs'}
            <div class="pop wide" role="menu">
              <span class="lbl">Subtitles</span>
              <button role="menuitemradio" aria-checked={current === null} class:on={current === null} onclick={() => selectTrack(null)}>Off</button>
              {#each tracks as track (track.id)}<button role="menuitemradio" aria-checked={current === track.id} class:on={current === track.id} onclick={() => selectTrack(track.id)}><span class="ell">{track.label}</span><em>{track.id.startsWith('embedded') ? 'In file' : track.id.startsWith('manual') ? 'Loaded' : 'Beside file'}</em></button>{/each}
              <hr />
              <button onclick={loadSubtitleFile}>Load subtitle file…</button>
              <div class="stepper"><span>Delay</span><button aria-label="Subtitles earlier" onclick={() => nudgeDelay(-0.1)}>−</button><b class="num">{delay.toFixed(1)}s</b><button aria-label="Subtitles later" onclick={() => nudgeDelay(0.1)}>+</button></div>
              <div class="stepper"><span>Size</span><button aria-label="Smaller subtitles" onclick={() => nudgeScale(-0.1)}>−</button><b class="num">{Math.round(scale * 100)}%</b><button aria-label="Larger subtitles" onclick={() => nudgeScale(0.1)}>+</button></div>
            </div>
          {/if}
        </div>
        <button class="ic" aria-label="Keyboard shortcuts" onclick={() => { ui.help = true }}><Icon name="keys" /></button>
        <button class="ic" aria-label="Picture in picture" onclick={togglePip}><Icon name="pip" /></button>
        <button class="ic" aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onclick={toggleFullscreen}><Icon name="full" /></button>
      </div>
    </footer>
  {/if}

  {#if failure}
    <section class="fail"><span class="lbl">Can’t play this file</span><h2>{episode?.fileName}</h2><p>{failure}</p><button class="btn white" onclick={leave}>Back to library</button></section>
  {/if}
</div>

<style>
  .stage { position: absolute; inset: 0; background: #000; display: grid; place-items: center; overflow: hidden; }
  .stage.bare { cursor: none; }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }

  .sublayer { position: absolute; display: flex; flex-direction: column; pointer-events: none; padding: 3.5% 4% 4.5%; transition: padding-bottom .2s; }
  .sublayer.raised { padding-bottom: 130px; }
  .subrow { flex: 1; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
  .cue { max-width: 86%; font-weight: 600; line-height: 1.22; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000, 0 2px 4px #000, 0 0 1px #000; user-select: none; }
  .ln { display: block; }

  .spin { position: absolute; width: 54px; height: 54px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, .15); border-top-color: var(--acc); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .osd { position: absolute; top: 90px; left: 50%; transform: translateX(-50%); z-index: 5; padding: 10px 16px; border-radius: 13px; font: 600 14px var(--ui); background: rgba(14, 14, 19, .86); border: 1px solid var(--line2); }

  .hide { opacity: 0; pointer-events: none; }
  .ptop { position: absolute; z-index: 4; inset: 0 0 auto 0; display: flex; align-items: center; gap: 14px; padding: 18px 170px 60px 24px; background: linear-gradient(180deg, rgba(0, 0, 0, .7), transparent); transition: opacity .22s; -webkit-app-region: drag; }
  .sq { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: rgba(255, 255, 255, .09); border: 1px solid var(--line2); -webkit-app-region: no-drag; }
  .sq:hover { background: rgba(255, 255, 255, .17); }
  .min { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .min b { font: 800 22px/1.1 var(--disp); letter-spacing: -.02em; }

  .pbot { position: absolute; z-index: 4; inset: auto 0 0 0; padding: 70px 28px 16px; background: linear-gradient(0deg, rgba(0, 0, 0, .86), transparent); transition: opacity .22s; }
  .seek { position: relative; height: 22px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
  .track { position: relative; width: 100%; height: 5px; border-radius: 5px; background: rgba(255, 255, 255, .2); overflow: hidden; transition: height .12s; }
  .seek:hover .track { height: 8px; }
  .track i { position: absolute; left: 0; top: 0; bottom: 0; }
  .buf { background: rgba(255, 255, 255, .28); }
  .val { background: var(--acc); }
  .knob { position: absolute; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, .6); }
  .tip { position: absolute; bottom: 28px; transform: translateX(-50%); padding: 5px 9px; border-radius: 9px; font: 500 12.5px var(--mono); background: rgba(14, 14, 19, .94); border: 1px solid var(--line2); }
  .bar-row { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
  .pp { width: 58px; height: 58px; display: grid; place-items: center; margin-right: 8px; border-radius: 50%; background: #fff; color: #000; transition: transform .12s; }
  .pp:active { transform: scale(.93); }
  .ic { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; color: #fff; }
  .ic:hover:not(:disabled) { background: rgba(255, 255, 255, .11); }
  .ic:disabled { opacity: .3; cursor: default; }
  .ic.lit { color: var(--acc); background: var(--acc-t); }
  .ic.txt { font: 600 14px var(--mono); }
  .time { margin-left: 12px; font: 500 14px var(--mono); color: var(--fg2); white-space: nowrap; }
  .time b { color: #fff; font-weight: 500; font-size: 18px; }
  .grow { flex: 1; }
  .vol { width: 104px; accent-color: #fff; height: 4px; margin-right: 8px; }
  .anchor { position: relative; }
  .pop { position: absolute; z-index: 6; right: 0; bottom: 56px; width: 190px; max-height: 62vh; overflow-y: auto; padding: 10px; border-radius: 20px; background: rgba(16, 16, 21, .96); border: 1px solid var(--line2); box-shadow: 0 30px 70px rgba(0, 0, 0, .6); display: flex; flex-direction: column; gap: 2px; }
  .pop.wide { width: 320px; }
  .pop .lbl { padding: 6px 10px 8px; }
  .pop > button { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 7px 11px; border-radius: 12px; text-align: left; font-weight: 500; color: var(--fg2); }
  .pop > button:hover { background: rgba(255, 255, 255, .08); color: #fff; }
  .pop > button.on { background: var(--acc-t); color: var(--acc); box-shadow: inset 0 0 0 1px var(--acc-l); }
  .pop em { margin-left: auto; flex: none; font: 500 11px var(--mono); font-style: normal; opacity: .65; }
  .pop hr { border: 0; border-top: 1px solid var(--line); margin: 6px 4px; }
  .stepper { display: flex; align-items: center; gap: 6px; padding: 3px 3px 3px 11px; color: var(--fg2); font-weight: 500; }
  .stepper span { flex: 1; }
  .stepper b { min-width: 58px; text-align: center; font: 500 13px var(--mono); color: #fff; }
  .stepper button { width: 34px; height: 34px; border-radius: 10px; background: rgba(255, 255, 255, .07); font-size: 18px; }
  .stepper button:hover { background: rgba(255, 255, 255, .15); }

  .pz-fade { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(90deg, rgba(5, 5, 8, .9), rgba(5, 5, 8, .35) 56%, transparent); }
  .pz { position: absolute; z-index: 2; left: 6%; top: 50%; transform: translateY(-54%); width: min(860px, 62%); display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
  .pz h1 { font: 900 clamp(48px, 6.4vw, 120px)/.9 var(--disp); letter-spacing: -.05em; text-transform: uppercase; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; padding-bottom: .05em; }
  .stats { display: flex; gap: 36px; margin: 8px 0; }
  .stats div { display: flex; flex-direction: column; }
  .stats b { font: 500 30px/1.1 var(--mono); }
  .stats span { font: 500 11.5px var(--mono); color: var(--fg3); text-transform: uppercase; letter-spacing: .1em; margin-top: 4px; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .hint { color: var(--fg3); font-size: 13px; }

  .end { position: absolute; inset: 0; z-index: 3; display: grid; grid-template-columns: minmax(250px, 24%) minmax(0, 1fr); gap: 4%; align-items: center; padding: 96px 6% 150px; background: rgba(7, 7, 10, .96); }
  .end-l { position: relative; display: flex; flex-direction: column; align-items: center; gap: 22px; }
  .ring { position: relative; width: clamp(130px, 13vw, 220px); aspect-ratio: 1; display: grid; place-items: center; }
  .ring svg { position: absolute; inset: 0; transform: rotate(-90deg); fill: none; stroke-width: 8; }
  .ring circle { stroke: rgba(255, 255, 255, .1); }
  .ring .v { stroke: var(--acc); stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
  .ring b { font: 300 clamp(54px, 5.6vw, 104px)/1 var(--ui); }
  .saved { display: flex; align-items: center; gap: 9px; font-weight: 600; font-size: 14px; }
  .saved i { width: 8px; height: 8px; border-radius: 50%; background: var(--live); }
  .end-r { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
  .end-art { position: relative; width: 100%; aspect-ratio: 2.4; overflow: hidden; clip-path: var(--cut); border-radius: 22px 22px 0 22px; background: var(--bg3); }
  .end-art b { position: absolute; right: 5%; bottom: 7%; font: 900 clamp(70px, 9vw, 170px)/.8 var(--disp); letter-spacing: -.05em; text-shadow: 0 10px 40px rgba(0, 0, 0, .5); }
  .end-r h2 { font: 900 clamp(38px, 4.6vw, 86px)/.92 var(--disp); letter-spacing: -.05em; text-transform: uppercase; }
  .done { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 18px; align-items: flex-start; position: relative; }

  .fail { position: absolute; z-index: 5; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 12px; padding: 0 8%; background: var(--bg); }
  .fail h2 { font: 800 40px/1.05 var(--disp); overflow-wrap: anywhere; }
  .fail p { color: var(--fg2); font-size: 17px; margin-bottom: 12px; }
  @media (max-width: 1100px) { .vol { display: none; } .time b { font-size: 15px; } .end { grid-template-columns: 1fr; } .end-r { display: none; } }
</style>
