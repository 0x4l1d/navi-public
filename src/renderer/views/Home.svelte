<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { afterImport, episodeLabel, episodeName, go, thumbUrl, ui, type Show } from '../lib/state.svelte.ts'
  import { formatTime } from '../../shared/playback.ts'

  let { shows }: { shows: Show[] } = $props()
  let filter = $state('')

  const resumable = $derived(shows.filter(show => show.next.position > 0 && !show.next.watched))
  const feature = $derived(resumable[0] ?? shows[0])
  const visible = $derived(shows.filter(show => show.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())))
  const percent = (position: number, duration: number) => duration ? Math.min(100, position / duration * 100) : 0
  const fit = (name: string) => Math.max(0.5, Math.min(1, 15 / Math.max(15, name.length * 0.9)))
</script>

<div class="page">
  {#if !shows.length}
    <section class="welcome">
      <div class="dots"></div>
      <span class="jp ghost" aria-hidden="true">ナビ</span>
      <div class="wrap">
        <span class="lbl">Local media library and player</span>
        <h1 class="mega">Everything<br />you own,<br /><span class="ghost">ready to play</span></h1>
        <p>Open a video or import a folder. Navi groups episodes, finds subtitles next to your files, and remembers the exact second you stopped.</p>
        <div class="row">
          <button class="btn white" onclick={async () => afterImport(await window.navi.openVideos())}><Icon name="film" />Open video</button>
          <button class="btn glass" onclick={async () => afterImport(await window.navi.importFolder())}><Icon name="folder" />Import folder</button>
        </div>
        <span class="hint">or drop files anywhere · nothing leaves this computer</span>
      </div>
    </section>
  {:else}
    {#if feature}
      <section class="hero">
        {#if thumbUrl(feature.next)}<img class="art" src={thumbUrl(feature.next)} alt="" />{:else}<div class="art-empty"></div>{/if}
        <div class="fade"></div>
        <div class="dots"></div>
        <b class="big num ghost" aria-hidden="true">{feature.next.episode === null ? '' : String(feature.next.episode).padStart(2, '0')}</b>
        <div class="wrap copy">
          <div class="tags">
            <span class="tag ac">{feature.next.position > 0 ? 'Continue' : 'Up next'}</span>
            <span class="tag">{episodeLabel(feature.next)}</span>
            {#if feature.next.duration}<span class="tag num">{formatTime(feature.next.duration)}</span>{/if}
          </div>
          <h1 class="mega" style:font-size="calc(clamp(56px, 7.4vw, 136px) * {fit(feature.name)})">{feature.name}</h1>
          {#if feature.isSeries}<p class="sub ell">{episodeName(feature.next)}</p>{/if}
          {#if feature.next.position > 0}
            <div class="prog"><div class="bar"><i style:width="{percent(feature.next.position, feature.next.duration)}%"></i></div><span class="num">{formatTime(feature.next.position)} of {formatTime(feature.next.duration)}</span></div>
          {/if}
          <div class="row">
            <button class="btn white" onclick={() => go({ name: 'player', id: feature.next.id })}><Icon name="play" />{feature.next.position > 0 ? 'Resume' : 'Play'}</button>
            {#if feature.isSeries}<button class="btn glass" onclick={() => go({ name: 'show', showId: feature.id })}>Episodes</button>{/if}
          </div>
        </div>
      </section>
    {/if}

    {#if resumable.length > 1}
      <section class="wrap block">
        <div class="head"><h2 class="h2">Continue watching</h2><span class="tag num">{resumable.length}</span></div>
        <div class="rail">
          {#each resumable as show (show.id)}
            <button class="wide" onclick={() => go({ name: 'player', id: show.next.id })}>
              {#if thumbUrl(show.next)}<img class="art" src={thumbUrl(show.next)} alt="" />{:else}<div class="art-empty"></div>{/if}
              <div class="shade"></div>
              <div class="meta"><b class="ell">{show.name}</b><span class="lbl">{episodeLabel(show.next)} · {formatTime(Math.max(0, show.next.duration - show.next.position))} left</span><div class="bar"><i style:width="{percent(show.next.position, show.next.duration)}%"></i></div></div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="wrap block">
      <div class="head">
        <h2 class="h2">Library</h2><span class="tag num">{shows.length}</span>
        <input class="input filter" type="search" placeholder="Filter library" aria-label="Filter library" bind:value={filter} />
      </div>
      {#if visible.length}
        <div class="grid">
          {#each visible as show (show.id)}
            <button class="poster" onclick={() => show.isSeries ? go({ name: 'show', showId: show.id }) : go({ name: 'player', id: show.next.id })}>
              <div class="frame">
                {#if thumbUrl(show.episodes[0]!)}<img class="art" src={thumbUrl(show.episodes[0]!)} alt="" loading="lazy" />{:else}<div class="art-empty"></div>{/if}
                <div class="shade"></div>
                {#if show.isSeries}<b class="count num">{String(show.episodes.length).padStart(2, '0')}</b>{/if}
              </div>
              <b class="ell name">{show.name}</b>
              <span class="lbl">{show.isSeries ? `${show.watched} of ${show.episodes.length} watched` : 'Film'}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="none">Nothing in your library matches “{filter}”.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .welcome { position: relative; min-height: 100%; display: flex; align-items: center; overflow: hidden; padding: 90px 0 110px; }
  .jp { position: absolute; right: 56px; top: 90px; writing-mode: vertical-rl; font: 900 clamp(150px, 20vw, 340px)/1 var(--disp); }
  .welcome h1 { margin: 16px 0 24px; }
  .welcome p { max-width: 620px; font-size: 18px; color: var(--fg2); }
  .row { display: flex; gap: 12px; margin-top: 28px; flex-wrap: wrap; }
  .hint { display: block; margin-top: 18px; color: var(--fg3); font-size: 13.5px; }

  .hero { position: relative; height: min(76vh, 760px); min-height: 520px; display: flex; align-items: flex-end; padding-bottom: 54px; overflow: hidden; }
  .fade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7, 7, 10, .94), rgba(7, 7, 10, .5) 52%, rgba(7, 7, 10, .12)), linear-gradient(0deg, var(--bg), transparent 45%), linear-gradient(180deg, rgba(7, 7, 10, .6), transparent 22%); }
  .big { position: absolute; right: 44px; bottom: 6px; font: 900 clamp(180px, 25vw, 460px)/.86 var(--disp); letter-spacing: -.06em; }
  .copy { width: 100%; max-width: 1180px; }
  .tags { display: flex; gap: 8px; margin-bottom: 18px; }
  .sub { margin-top: 14px; font: 600 22px var(--disp); color: var(--fg2); max-width: 720px; }
  .prog { display: flex; align-items: center; gap: 14px; margin-top: 18px; max-width: 520px; font: 500 12.5px var(--mono); color: var(--fg2); white-space: nowrap; }
  .prog .bar { flex: 1; }

  .block { margin-top: 40px; }
  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .filter { margin-left: auto; width: 280px; }
  .rail { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
  .wide { position: relative; flex: 0 0 340px; aspect-ratio: 16/9; border-radius: 20px; overflow: hidden; text-align: left; box-shadow: 0 0 0 1px var(--line2); }
  .shade { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(7, 7, 10, .92), transparent 62%); }
  .meta { position: absolute; left: 16px; right: 16px; bottom: 14px; display: flex; flex-direction: column; gap: 6px; }
  .meta b { font: 800 19px var(--disp); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 26px 20px; }
  .poster { min-width: 0; text-align: left; display: flex; flex-direction: column; gap: 5px; }
  .frame { position: relative; aspect-ratio: 3/4; overflow: hidden; clip-path: var(--cut); border-radius: 18px 18px 0 18px; background: var(--bg3); margin-bottom: 8px; transition: transform .2s; }
  .poster:hover .frame { transform: translateY(-4px); }
  .count { position: absolute; left: 14px; bottom: 2px; font: 900 72px/1 var(--disp); letter-spacing: -.05em; }
  .name { font: 700 17px var(--disp); }
  .none { color: var(--fg2); padding: 30px 0; }
</style>
