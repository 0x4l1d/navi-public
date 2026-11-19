<script lang="ts">
  import Icon from './Icon.svelte'
  import { afterImport, episodeLabel, episodeName, go, ui, type Show } from '../lib/state.svelte.ts'

  interface Item { key: string, group: string, title: string, detail: string, icon: string, run: () => void | Promise<void> }

  let { shows }: { shows: Show[] } = $props()
  let query = $state('')
  let selected = $state(0)
  let input = $state<HTMLInputElement>()

  const actions: Item[] = [
    { key: 'a-open', group: 'Actions', title: 'Open video', detail: 'Choose files to play', icon: 'film', run: async () => afterImport(await window.navi.openVideos()) },
    { key: 'a-folder', group: 'Actions', title: 'Import folder', detail: 'Add everything inside', icon: 'folder', run: async () => afterImport(await window.navi.importFolder()) },
    { key: 'a-settings', group: 'Actions', title: 'Settings', detail: 'Playback, subtitles, folders', icon: 'settings', run: () => go({ name: 'settings' }) },
    { key: 'a-keys', group: 'Actions', title: 'Keyboard shortcuts', detail: 'Everything the keyboard can do', icon: 'keys', run: () => { ui.help = true } }
  ]

  const items = $derived.by(() => {
    const term = query.trim().toLocaleLowerCase()
    const match = (text: string) => text.toLocaleLowerCase().includes(term)
    const found: Item[] = []
    for (const show of shows) {
      if (match(show.name)) {
        found.push({ key: `s-${show.id}`, group: 'Library', title: show.name, detail: show.isSeries ? `${show.episodes.length} episodes` : 'Film', icon: 'play', run: () => show.isSeries ? go({ name: 'show', showId: show.id }) : go({ name: 'player', id: show.next.id }) })
      }
      if (!term) continue
      for (const episode of show.episodes) {
        if (show.isSeries && (match(episode.title) || match(episode.fileName))) {
          found.push({ key: `e-${episode.id}`, group: 'Episodes', title: episodeName(episode), detail: `${show.name} · ${episodeLabel(episode)}`, icon: 'play', run: () => go({ name: 'player', id: episode.id }) })
        }
      }
    }
    return [...found.slice(0, 8), ...actions.filter(action => match(action.title))]
  })

  $effect(() => { input?.focus() })
  $effect(() => { void query; selected = 0 })

  function choose (item: Item | undefined) {
    if (!item) return
    ui.palette = false
    void item.run()
  }

  function onKey (event: KeyboardEvent) {
    event.stopPropagation()
    if (event.key === 'Escape') { ui.palette = false; return }
    if (event.key === 'Enter') { choose(items[selected]); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length)
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={event => { if (event.target === event.currentTarget) ui.palette = false }}>
  <div class="sheet" role="dialog" aria-label="Search">
    <div class="field"><Icon name="search" size={22} /><input bind:this={input} bind:value={query} onkeydown={onKey} placeholder="Search your library" aria-label="Search your library" spellcheck="false" autocomplete="off" /><kbd>Esc</kbd></div>
    <div class="results" role="listbox" aria-label="Results">
      {#each items as item, index (item.key)}
        {#if index === 0 || items[index - 1]?.group !== item.group}<span class="lbl group">{item.group}</span>{/if}
        <button role="option" aria-selected={index === selected} class:on={index === selected} onmouseenter={() => { selected = index }} onclick={() => choose(item)}>
          <Icon name={item.icon} size={18} /><b class="ell">{item.title}</b><span class="ell">{item.detail}</span>
        </button>
      {:else}
        <p>No matches for “{query}”.</p>
      {/each}
    </div>
  </div>
</div>

<style>
  .field { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
  input { flex: 1; min-width: 0; background: none; border: 0; outline: none; font: 600 22px var(--disp); user-select: text; }
  input::placeholder { color: var(--fg3); }
  .results { max-height: 50vh; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; }
  .group { padding: 12px 12px 6px; }
  button { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 8px 12px; border-radius: 13px; text-align: left; color: var(--fg2); }
  button.on { background: rgba(255, 255, 255, .09); color: #fff; }
  b { font-weight: 600; color: var(--fg); min-width: 0; }
  span.ell { margin-left: auto; font-size: 13px; color: var(--fg3); flex: none; max-width: 45%; }
  p { padding: 22px 12px; color: var(--fg2); }
</style>
