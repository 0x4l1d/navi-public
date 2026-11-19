<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { afterImport, toast, ui } from '../lib/state.svelte.ts'

  import type { Settings } from '../../shared/types.ts'

  const LANGUAGES = ['English', 'Arabic', 'Japanese', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Russian', 'Korean', 'Chinese']
  const settings = $derived(ui.library!.settings)

  async function set (patch: Partial<Settings>) {
    ui.library!.settings = await window.navi.setSettings(patch)
  }
  async function rescan () {
    ui.library = await window.navi.rescan()
    toast('Library is up to date')
  }
  async function removeFolder (folder: string) {
    ui.library = await window.navi.removeFolder(folder)
    toast('Folder removed from your library. The files are still on disk.')
  }
</script>

<div class="page">
  <div class="dots"></div>
  <div class="wrap body">
    <span class="lbl">Navi Public</span>
    <h1 class="mega">Settings</h1>

    <section>
      <h2 class="h2">Playback</h2>
      <label class="line"><span><b>Play the next episode</b><small>Starts after an eight second countdown.</small></span>
        <input type="checkbox" role="switch" checked={settings.autoplayNext} onchange={event => set({ autoplayNext: event.currentTarget.checked })} /></label>
      <label class="line"><span><b>Seek step</b><small>Used by the left and right arrow keys.</small></span>
        <select class="input" value={settings.seekStep} onchange={event => set({ seekStep: Number(event.currentTarget.value) })}>
          {#each [5, 10, 15, 30] as step (step)}<option value={step}>{step} seconds</option>{/each}
        </select></label>
    </section>

    <section>
      <h2 class="h2">Subtitles</h2>
      <label class="line"><span><b>Preferred language</b><small>Chosen first when a video has several tracks.</small></span>
        <select class="input" value={settings.subtitleLanguage} onchange={event => set({ subtitleLanguage: event.currentTarget.value })}>
          <option value="">First available</option>
          {#each LANGUAGES as language (language)}<option value={language}>{language}</option>{/each}
        </select></label>
      <label class="line"><span><b>Size</b><small class="num">{Math.round(settings.subtitleScale * 100)}%</small></span>
        <input type="range" min="0.6" max="2" step="0.1" value={settings.subtitleScale} onchange={event => set({ subtitleScale: Number(event.currentTarget.value) })} /></label>
    </section>

    <section>
      <div class="head">
        <h2 class="h2">Folders</h2>
        <button class="btn glass sm" onclick={rescan}><Icon name="refresh" size={17} />Rescan</button>
        <button class="btn white sm" onclick={async () => afterImport(await window.navi.importFolder())}><Icon name="plus" size={17} />Add folder</button>
      </div>
      {#each ui.library!.folders as folder (folder)}
        <div class="line"><span class="ell path">{folder}</span><button class="btn glass sm" onclick={() => removeFolder(folder)}>Remove</button></div>
      {:else}
        <p class="none">No folders yet. Imported folders are checked for new videos each time Navi starts.</p>
      {/each}
    </section>

    <section>
      <h2 class="h2">About</h2>
      <p class="none">Navi Public keeps your library on this computer and makes no network connections. Released under the MIT License. Third-party notices are installed beside the app.</p>
    </section>
  </div>
</div>

<style>
  .body { max-width: 1000px; padding-top: 110px; }
  h1 { margin: 10px 0 30px; }
  section { margin-top: 36px; }
  .head { display: flex; align-items: center; gap: 10px; }
  .head .h2 { flex: 1; }
  .line { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 74px; padding: 12px 0; border-bottom: 1px solid var(--line); }
  .line span:not(.path) { display: flex; flex-direction: column; }
  .line b { font-weight: 600; }
  small { color: var(--fg3); font-size: 13.5px; }
  select { min-width: 200px; }
  option { background: var(--bg3); }
  input[type='checkbox'] { appearance: none; width: 46px; height: 26px; flex: none; border-radius: 26px; background: rgba(255, 255, 255, .16); position: relative; cursor: pointer; transition: background-color .15s; }
  input[type='checkbox']::after { content: ''; position: absolute; left: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .15s; }
  input[type='checkbox']:checked { background: var(--acc); }
  input[type='checkbox']:checked::after { transform: translateX(20px); background: var(--on-acc); }
  input[type='range'] { width: 220px; accent-color: var(--acc); }
  .path { font: 500 13.5px var(--mono); color: var(--fg2); min-width: 0; }
  .none { color: var(--fg2); margin-top: 12px; max-width: 720px; }
</style>
