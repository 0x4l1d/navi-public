<script lang="ts">
  import { onMount } from 'svelte'

  import Icon from './components/Icon.svelte'
  import Palette from './components/Palette.svelte'
  import ShortcutHelp from './components/ShortcutHelp.svelte'
  import { afterImport, buildShows, go, refresh, ui } from './lib/state.svelte.ts'
  import { queueThumbs } from './lib/thumbs.ts'
  import Home from './views/Home.svelte'
  import Player from './views/Player.svelte'
  import Settings from './views/Settings.svelte'
  import ShowPage from './views/ShowPage.svelte'
  import { isTextEntry } from '../shared/playback.ts'

  let dropping = $state(false)
  let now = $state(new Date())

  const shows = $derived(buildShows(ui.library?.episodes ?? []))
  const inPlayer = $derived(ui.view.name === 'player')
  const clock = $derived(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))

  onMount(() => {
    void refresh()
    window.naviEvents.onLibraryChanged(() => void refresh())
    const tick = setInterval(() => { now = new Date() }, 15_000)
    return () => clearInterval(tick)
  })

  $effect(() => {
    if (ui.library && !inPlayer) queueThumbs(ui.library.episodes, () => void refresh())
  })

  function onKey (event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyK') {
      event.preventDefault()
      ui.palette = !ui.palette
      return
    }
    if (isTextEntry(event.target as HTMLElement) || event.ctrlKey || event.altKey || event.metaKey) return
    if (event.key === '/') { event.preventDefault(); ui.palette = true }
    if (event.key === '?') { event.preventDefault(); ui.help = !ui.help }
  }

  async function drop (event: DragEvent) {
    event.preventDefault()
    dropping = false
    const files = [...event.dataTransfer?.files ?? []]
    if (files.length) await afterImport(await window.navi.importDropped(files))
  }
</script>

<svelte:window onkeydown={onKey} ondragover={event => { event.preventDefault(); dropping = true }} ondragleave={event => { if (!event.relatedTarget) dropping = false }} ondrop={drop} />

<main>
  {#if ui.library}
    {#if ui.view.name === 'home'}
      <Home {shows} />
    {:else if ui.view.name === 'show'}
      {#key ui.view.showId}<ShowPage show={shows.find(entry => ui.view.name === 'show' && entry.id === ui.view.showId)} />{/key}
    {:else if ui.view.name === 'settings'}
      <Settings />
    {:else if ui.view.name === 'player'}
      <Player id={ui.view.id} />
    {/if}
  {/if}
</main>

{#if !inPlayer}
  <header class="top">
    <button class="mark" onclick={() => go({ name: 'home' })} aria-label="Home">navi<i></i></button>
    <span class="clock num">{clock}</span>
  </header>
  <nav class="dock" aria-label="Main">
    <button class:on={ui.view.name === 'home'} onclick={() => go({ name: 'home' })}><Icon name="home" /><span>Library</span></button>
    <button aria-label="Search" title="Search (Ctrl+K)" onclick={() => { ui.palette = true }}><Icon name="search" /></button>
    <button aria-label="Open video" title="Open video" onclick={async () => afterImport(await window.navi.openVideos())}><Icon name="film" /></button>
    <button aria-label="Import folder" title="Import folder" onclick={async () => afterImport(await window.navi.importFolder())}><Icon name="folder" /></button>
    <button aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onclick={() => { ui.help = true }}><Icon name="keys" /></button>
    <button class:on={ui.view.name === 'settings'} aria-label="Settings" title="Settings" onclick={() => go({ name: 'settings' })}><Icon name="settings" /></button>
  </nav>
{/if}

<div class="win" class:over={inPlayer}>
  <button aria-label="Minimize" onclick={() => window.navi.minimize()}><Icon name="min" size={16} /></button>
  <button aria-label="Maximize" onclick={() => window.navi.toggleMaximize()}><Icon name="max" size={15} /></button>
  <button class="x" aria-label="Close" onclick={() => window.navi.close()}><Icon name="close" size={16} /></button>
</div>

{#if ui.palette}<Palette {shows} />{/if}
{#if ui.help}<ShortcutHelp />{/if}
{#if ui.toast}<div class="toast" role="status">{ui.toast}</div>{/if}
{#if dropping}<div class="dropzone"><div><span class="lbl">Drop to add</span><b class="mega ghost">Your files</b></div></div>{/if}

<style>
  main { position: fixed; inset: 0; }
  .top { position: fixed; z-index: 30; top: 0; left: 0; right: 0; height: 76px; display: flex; align-items: center; gap: 20px; padding: 0 150px 0 72px; -webkit-app-region: drag; pointer-events: none; }
  .mark { pointer-events: auto; -webkit-app-region: no-drag; position: relative; font: 800 30px/1 var(--disp); letter-spacing: -.04em; padding-right: 8px; }
  .mark i { position: absolute; right: 0; top: 2px; width: 7px; height: 7px; border-radius: 50%; background: var(--acc); }
  .clock { margin-left: auto; font: 500 13px var(--mono); color: var(--fg2); padding: 7px 12px; border-radius: 11px; background: rgba(10, 10, 14, .55); border: 1px solid var(--line); }
  .win { position: fixed; z-index: 70; top: 0; right: 0; display: flex; -webkit-app-region: no-drag; }
  .win button { width: 46px; height: 36px; display: grid; place-items: center; color: var(--fg2); }
  .win button:hover { background: rgba(255, 255, 255, .1); color: #fff; }
  .win .x:hover { background: #e5484d; }
  .dock { position: fixed; z-index: 30; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; gap: 4px; padding: 8px; border-radius: 22px; background: rgba(14, 14, 19, .86); border: 1px solid var(--line2); backdrop-filter: blur(24px); box-shadow: 0 20px 50px rgba(0, 0, 0, .55); }
  .dock button { display: flex; align-items: center; gap: 9px; height: 46px; min-width: 46px; justify-content: center; padding: 0 12px; border-radius: 15px; color: var(--fg2); font-weight: 600; transition: background-color .15s, color .15s; }
  .dock button:hover { background: rgba(255, 255, 255, .09); color: #fff; }
  .dock button.on { background: #fff; color: #000; padding: 0 18px; }
  .dock span { display: none; }
  .dock .on span { display: inline; }
  .toast { position: fixed; z-index: 80; left: 50%; bottom: 104px; transform: translateX(-50%); padding: 12px 18px; border-radius: 14px; background: #fff; color: #000; font-weight: 600; box-shadow: 0 20px 40px rgba(0, 0, 0, .5); }
  .dropzone { position: fixed; z-index: 90; inset: 16px; border-radius: 28px; border: 2px dashed var(--acc-l); background: rgba(7, 7, 10, .92); display: grid; place-items: center; text-align: center; pointer-events: none; }
  .dropzone b { display: block; margin-top: 10px; }
</style>
