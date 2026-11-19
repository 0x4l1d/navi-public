<script lang="ts">
  const PATHS: Record<string, string> = {
    play: 'M7 4.5v15l12-7.5z',
    pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
    next: 'M6 5v14l9-7zM16.5 5H19v14h-2.5z',
    prev: 'M18 5v14l-9-7zM5 5h2.5v14H5z',
    back: 'M15 5l-7 7 7 7',
    home: 'M4 11l8-7 8 7v9h-5.5v-6h-5v6H4z',
    search: 'M11 4a7 7 0 1 0 4.4 12.4L20 21l1-1-4.6-4.6A7 7 0 0 0 11 4z',
    plus: 'M12 5v14M5 12h14',
    folder: 'M3 6.5h6l2 2.5h10v10.5H3z',
    film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4',
    settings: 'M5 7h9M18 7h1M5 17h1M10 17h9M16 5v4M8 15v4',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    close: 'M6 6l12 12M18 6L6 18',
    min: 'M6 12h12',
    max: 'M6.5 6.5h11v11h-11z',
    volume: 'M4 9.5v5h4l5 4v-13l-5 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
    mute: 'M4 9.5v5h4l5 4v-13l-5 4zM16.5 9.5l5 5M21.5 9.5l-5 5',
    subs: 'M3.5 5.5h17v13h-17zM7 11h4M13 11h4M7 15h7M16 15h1',
    audio: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    speed: 'M12 13l4-4M4.5 18a9 9 0 1 1 15 0',
    full: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    pip: 'M3.5 5h17v14h-17zM12 12h6v5h-6z',
    keys: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14.5h8',
    replay: 'M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5',
    refresh: 'M20 12a8 8 0 1 1-2.5-5.8L20 8.5M20 4v4.5h-4.5',
    trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13'
  }
  const FILLED = new Set(['play', 'pause', 'next', 'prev'])
  let { name, size = 20 }: { name: string, size?: number } = $props()
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={FILLED.has(name) ? 'currentColor' : 'none'} stroke={FILLED.has(name) ? 'none' : 'currentColor'} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={PATHS[name]} /></svg>
