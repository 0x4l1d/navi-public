<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { back, episodeLabel, episodeName, go, thumbUrl, toast, ui, type Show } from '../lib/state.svelte.ts'
  import { formatTime } from '../../shared/playback.ts'

  let { show }: { show: Show | undefined } = $props()
  let season = $state<number | null>(null)

  const current = $derived(season ?? show?.next.season ?? 1)
  const list = $derived(show?.episodes.filter(entry => entry.season === current) ?? [])
  const fit = $derived(show ? Math.max(0.5, Math.min(1, 15 / Math.max(15, show.name.length * 0.9))) : 1)

  async function toggle (ids: string[], watched: boolean) {
    ui.library = await window.navi.setWatched(ids, watched)
  }

  async function remove () {
    if (!show) return
    ui.library = await window.navi.removeShow(show.id)
    toast(`${show.name} removed from your library. The files are still on disk.`)
    go({ name: 'home' })
  }
</script>

<div class="page">
  {#if show}
    <section class="hero">
      {#if thumbUrl(show.next)}<img class="art" src={thumbUrl(show.next)} alt="" />{:else}<div class="art-empty"></div>{/if}
      <div class="fade"></div>
      <div class="dots"></div>
      <div class="wrap copy">
        <button class="btn glass sm backb" onclick={back}><Icon name="back" size={18} />Back</button>
        <div class="tags">
          <span class="tag num">{show.episodes.length} {show.episodes.length === 1 ? 'episode' : 'episodes'}</span>
          {#if show.seasons.length > 1}<span class="tag num">{show.seasons.length} seasons</span>{/if}
          <span class="tag num">{show.watched} watched</span>
        </div>
        <h1 class="mega" style:font-size="calc(clamp(56px, 7.4vw, 136px) * {fit})">{show.name}</h1>
        <div class="row">
          <button class="btn white" onclick={() => go({ name: 'player', id: show.next.id })}><Icon name="play" />{show.next.position > 0 ? `Resume ${episodeLabel(show.next)}` : `Play ${episodeLabel(show.next)}`}</button>
          <button class="btn glass" onclick={() => toggle(show.episodes.map(entry => entry.id), show.watched !== show.episodes.length)}><Icon name="check" />{show.watched === show.episodes.length ? 'Mark unwatched' : 'Mark all watched'}</button>
          <button class="btn glass" aria-label="Remove from library" title="Remove from library" onclick={remove}><Icon name="trash" /></button>
        </div>
      </div>
    </section>

    <section class="wrap">
      {#if show.seasons.length > 1}
        <div class="seasons" role="tablist" aria-label="Seasons">
          {#each show.seasons as entry (entry)}
            <button role="tab" aria-selected={entry === current} class:on={entry === current} onclick={() => { season = entry }}>Season {entry}</button>
          {/each}
        </div>
      {/if}
      <div class="grid">
        {#each list as episode (episode.id)}
          {@const percent = episode.duration ? Math.min(100, episode.position / episode.duration * 100) : 0}
          <article class="card" class:seen={episode.watched} class:gone={episode.missing}>
            <button class="thumb" disabled={episode.missing} onclick={() => go({ name: 'player', id: episode.id })} aria-label="Play {episodeName(episode)}">
              {#if thumbUrl(episode)}<img class="art" src={thumbUrl(episode)} alt="" loading="lazy" />{:else}<div class="art-empty"></div>{/if}
              <div class="shade"></div>
              <b class="n num">{episode.episode === null ? '' : String(episode.episode).padStart(2, '0')}</b>
              {#if episode.duration}<span class="dur num">{formatTime(episode.duration)}</span>{/if}
              {#if percent > 0 && !episode.watched}<div class="bar"><i style:width="{percent}%"></i></div>{/if}
            </button>
            <div class="info">
              <div class="min"><b class="ell">{episodeName(episode)}</b><span class="lbl ell">{episode.missing ? 'File not found' : episode.watched ? 'Watched' : percent > 0 ? `${formatTime(episode.position)} in` : episode.fileName}</span></div>
              <button class="tick" class:on={episode.watched} aria-label={episode.watched ? 'Mark unwatched' : 'Mark watched'} title={episode.watched ? 'Mark unwatched' : 'Mark watched'} onclick={() => toggle([episode.id], !episode.watched)}><Icon name="check" size={17} /></button>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {:else}
    <div class="wrap gone-page"><h1 class="mega ghost">Not here</h1><button class="btn white" onclick={() => go({ name: 'home' })}>Back to library</button></div>
  {/if}
</div>

<style>
  .hero { position: relative; min-height: 520px; height: 62vh; display: flex; align-items: flex-end; padding-bottom: 40px; overflow: hidden; }
  .fade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7, 7, 10, .95), rgba(7, 7, 10, .45) 60%, rgba(7, 7, 10, .2)), linear-gradient(0deg, var(--bg), transparent 50%); }
  .copy { width: 100%; }
  .backb { position: absolute; left: 72px; bottom: calc(100% + 60px); }
  .tags { display: flex; gap: 8px; margin-bottom: 16px; }
  .row { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
  .seasons { display: flex; gap: 8px; margin: 12px 0 24px; }
  .seasons button { height: 40px; padding: 0 16px; border-radius: 12px; font-weight: 600; background: rgba(255, 255, 255, .06); color: var(--fg2); }
  .seasons button.on { background: #fff; color: #000; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px 20px; margin-top: 16px; }
  .card { min-width: 0; }
  .thumb { position: relative; display: block; width: 100%; aspect-ratio: 16/9; overflow: hidden; clip-path: var(--cut); border-radius: 16px 16px 0 16px; background: var(--bg3); }
  .thumb img { transition: transform .35s; }
  .thumb:hover img { transform: scale(1.04); }
  .shade { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(7, 7, 10, .78), transparent 58%); }
  .n { position: absolute; left: 14px; bottom: 4px; font: 900 64px/1 var(--disp); letter-spacing: -.05em; }
  .dur { position: absolute; right: 30px; bottom: 12px; font: 500 12px var(--mono); }
  .thumb .bar { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 0; }
  .seen .thumb { opacity: .62; }
  .gone { opacity: .45; }
  .info { display: flex; align-items: center; gap: 10px; padding: 11px 2px 0; }
  .min { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .min b { font: 700 16.5px var(--disp); }
  .min .lbl { font-size: 11px; letter-spacing: .05em; text-transform: none; }
  .tick { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 11px; color: var(--fg3); border: 1px solid var(--line); }
  .tick:hover { color: #fff; background: rgba(255, 255, 255, .08); }
  .tick.on { background: var(--acc-t); border-color: var(--acc-l); color: var(--acc); }
  .gone-page { padding-top: 200px; display: flex; flex-direction: column; gap: 24px; align-items: flex-start; }
</style>
