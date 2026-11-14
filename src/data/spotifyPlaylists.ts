// Public Spotify playlists (owner: Spotify). Every ID was checked against open.spotify.com/oembed and
// open.spotify.com/embed on 2026-11-14 (name and track count below are what those endpoints returned).
export interface WorkoutPlaylist { id: string; name: string; note: string }
export const WORKOUT_PLAYLISTS: { key: 'run' | 'hiit' | 'lift' | 'walk'; label: string; lists: WorkoutPlaylist[] }[] = [
  { key: 'run', label: 'Running', lists: [
    { id: '37i9dQZF1DX35oM5SPECmN', name: 'Run Wild', note: '75 tracks' },
    { id: '37i9dQZF1DXadOVCgGhS7j', name: 'Fun Run', note: '50 tracks' },
    { id: '37i9dQZF1DWZUTt0fNaCPB', name: 'Running to Rock', note: '75 tracks' },
  ] },
  { key: 'hiit', label: 'HIIT', lists: [
    { id: '37i9dQZF1DWSJHnPb1f0X3', name: 'Cardio', note: '100 tracks' },
    { id: '37i9dQZF1DWUVpAXiEPK8P', name: 'Power Workout', note: '50 tracks' },
    { id: '37i9dQZF1DX4eRPd9frC1m', name: 'Hype', note: '75 tracks' },
  ] },
  { key: 'lift', label: 'Lifting', lists: [
    { id: '37i9dQZF1DX76Wlfdnj7AP', name: 'Beast Mode', note: '100 tracks' },
    { id: '37i9dQZF1DXdxcBWuJkbcy', name: 'Gym Hits', note: '79 tracks' },
    { id: '37i9dQZF1DXbFRZSqP41al', name: 'One More Rep', note: '60 tracks' },
  ] },
  { key: 'walk', label: 'Walking', lists: [
    { id: '37i9dQZF1DX9BXb6GsGCLl', name: 'Powerwalk!', note: '80 tracks' },
  ] },
];
