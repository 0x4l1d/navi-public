<script lang="ts">
  import { ui } from '../lib/state.svelte.ts'

  const GROUPS: Array<[string, Array<[string, string[]]>]> = [
    ['Playback', [['Play or pause', ['Space', 'K']], ['Seek by your step', ['←', '→']], ['Back or forward 10 s', ['J', 'L']], ['Jump to 0–90%', ['0', '9']], ['Slower or faster', [',', '.']], ['Previous or next episode', ['P', 'N']]]],
    ['Subtitles', [['Next track', ['C']], ['Previous track', ['Shift', 'C']], ['Delay', ['[', ']']], ['Size', ['-', '=']]]],
    ['Sound and view', [['Volume', ['↑', '↓']], ['Mute', ['M']], ['Next audio track', ['A']], ['Fullscreen', ['F']], ['Picture in picture', ['I']], ['Leave the player', ['Esc']]]],
    ['Anywhere', [['Search', ['Ctrl', 'K']], ['This list', ['?']]]]
  ]

  function onKey (event: KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); ui.help = false }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={event => { if (event.target === event.currentTarget) ui.help = false }}>
  <div class="sheet help" role="dialog" aria-label="Keyboard shortcuts">
    <h2 class="h2">Keyboard shortcuts</h2>
    <div class="cols">
      {#each GROUPS as [title, rows] (title)}
        <section>
          <span class="lbl">{title}</span>
          {#each rows as [label, keys] (label)}<div class="r"><span>{label}</span><i>{#each keys as key (key)}<kbd>{key}</kbd>{/each}</i></div>{/each}
        </section>
      {/each}
    </div>
  </div>
</div>

<style>
  .help { width: min(960px, calc(100vw - 48px)); padding: 28px; max-height: 76vh; overflow-y: auto; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 26px 44px; margin-top: 20px; }
  .r { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 36px; color: var(--fg2); }
  i { display: flex; gap: 5px; font-style: normal; }
  section .lbl { display: block; margin-bottom: 6px; }
</style>
