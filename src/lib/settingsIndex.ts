// Settings: the sections, every searchable setting, and where the old settings pages moved. Pure — tested in
// tools/test-settings.ts (every item points at a real section, every old route redirects, search finds things).
export interface SettingsSection { id: string; title: string; icon: string; sub: string; group: 'you' | 'activity' | 'connections' | 'app' }
export const SECTIONS: SettingsSection[] = [
  { id: 'account', title: 'Account & security', icon: 'lock', sub: 'Email, password, sign-in, sync', group: 'you' },
  { id: 'profile', title: 'Profile', icon: 'user', sub: 'Name, body stats, training, HYROX division', group: 'you' },
  { id: 'privacy', title: 'Privacy', icon: 'eye', sub: 'Privacy zones, map visibility, who sees your activities', group: 'you' },
  { id: 'safety', title: 'Safety', icon: 'shield', sub: 'Account status, reports, who can message you, restricted and blocked', group: 'you' },
  { id: 'units', title: 'Units & display', icon: 'ruler', sub: 'mi / km, lb / kg, step length, heart-rate max, FTP', group: 'activity' },
  { id: 'recording', title: 'Recording', icon: 'record', sub: 'Auto-pause, map style, GPS tips', group: 'activity' },
  { id: 'notifications', title: 'Sounds & voice cues', icon: 'volume', sub: 'Beeps, vibration, spoken splits, notifications', group: 'activity' },
  { id: 'goals', title: 'Goals & fuel', icon: 'target', sub: 'Step and calorie goals, macros, plans', group: 'activity' },
  { id: 'devices', title: 'Devices & integrations', icon: 'watch', sub: 'Heart-rate strap, watch files, Strava, Spotify', group: 'connections' },
  { id: 'messages', title: 'Messages & calls', icon: 'chat', sub: 'Who can message or call you, read receipts, Do not disturb', group: 'connections' },
  { id: 'appearance', title: 'Appearance', icon: 'sun', sub: 'Light, Dark or follow your device', group: 'app' },
  { id: 'data', title: 'Data & storage', icon: 'data', sub: 'Export, import, sample data, delete everything', group: 'app' },
  { id: 'help', title: 'Help & legal', icon: 'help', sub: 'Terms, Privacy Policy, sources, community rules, crisis lines', group: 'app' },
  { id: 'about', title: 'About HYBRD', icon: 'info', sub: 'Version, credits, map data', group: 'app' },
];
export const GROUPS: { id: SettingsSection['group']; label: string }[] = [
  { id: 'you', label: 'You' }, { id: 'activity', label: 'Training & recording' }, { id: 'connections', label: 'Connections' }, { id: 'app', label: 'App' },
];
export interface SettingsItem { label: string; section: string; anchor?: string; keywords?: string }
export const ITEMS: SettingsItem[] = [
  // account
  { label: 'Sign in / create account', section: 'account', keywords: 'login log in sign up register' },
  { label: 'Change email', section: 'account', keywords: 'email address' },
  { label: 'Change password', section: 'account', keywords: 'password reset forgot' },
  { label: 'Sync now', section: 'account', keywords: 'cloud sync backup devices laptop phone' },
  { label: 'Sign out', section: 'account', keywords: 'log out logout' },
  { label: 'Take time off (pause account)', section: 'account', anchor: 'time-off', keywords: 'break pause deactivate hide suspend resume vacation detox' },
  { label: 'Delete account', section: 'account', anchor: 'delete', keywords: 'close remove deactivate erase reopen 30 days' },
  // profile
  { label: 'Name', section: 'profile', anchor: 'body', keywords: 'display name' },
  { label: 'Weight', section: 'profile', anchor: 'body', keywords: 'body weight kg lb' },
  { label: 'Height, age, sex', section: 'profile', anchor: 'body', keywords: 'height age sex' },
  { label: 'Activity level & goal', section: 'profile', anchor: 'body', keywords: 'lose maintain gain TDEE' },
  { label: 'Training days per week', section: 'profile', anchor: 'training', keywords: 'sessions schedule' },
  { label: 'HYROX division', section: 'profile', anchor: 'training', keywords: 'hyrox pro open women men weights' },
  { label: 'Profile photo & bio', section: 'profile', anchor: 'photo', keywords: 'avatar picture about me' },
  // privacy
  { label: 'Privacy zones', section: 'privacy', anchor: 'zones', keywords: 'home work address hide location' },
  { label: 'Hide start & end of routes', section: 'privacy', anchor: 'map', keywords: 'map visibility trim start finish' },
  { label: 'Hide the map by default', section: 'privacy', anchor: 'map', keywords: 'map visibility route' },
  { label: 'Who can see my activities', section: 'privacy', anchor: 'activities', keywords: 'visibility only me friends everyone public default' },
  { label: 'Share heart rate & calories', section: 'privacy', anchor: 'activities', keywords: 'health data hr kcal' },
  { label: 'Public profile & posts', section: 'privacy', anchor: 'social', keywords: 'friends stories feed private account handle' },
  { label: 'Data consents (health & location)', section: 'privacy', anchor: 'consents', keywords: 'consent withdraw mood mental health gps precise location my health my data opt in' },
  // safety
  { label: 'Account status', section: 'safety', anchor: 'status', keywords: 'moderation removed suspended restricted appeal violation guidelines' },
  { label: 'Appeal a decision', section: 'safety', anchor: 'status', keywords: 'appeal moderation removed suspended' },
  { label: 'My reports', section: 'safety', anchor: 'reports', keywords: 'report status reported' },
  { label: 'Who can message or call me', section: 'safety', anchor: 'messaging', keywords: 'dm messages calls requests everyone friends no one' },
  { label: 'Restricted accounts', section: 'safety', anchor: 'restricted', keywords: 'restrict unrestrict harassment quiet' },
  { label: 'Blocked accounts', section: 'safety', anchor: 'blocked', keywords: 'block unblock' },
  { label: 'Community Guidelines', section: 'safety', keywords: 'rules community guidelines allowed' },
  { label: 'How reporting works', section: 'safety', keywords: 'report anonymous moderation' },
  // units
  { label: 'Distance units (mi / km)', section: 'units', keywords: 'miles kilometres kilometers imperial metric pace speed feet' },
  { label: 'Weight units (lb / kg)', section: 'units', keywords: 'pounds kilograms lifts' },
  { label: 'Step length', section: 'units', keywords: 'stride steps' },
  { label: 'Max heart rate', section: 'units', keywords: 'hr zones bpm' },
  { label: 'FTP (cycling power)', section: 'units', keywords: 'watts power threshold' },
  { label: 'Backyard distance display', section: 'units', keywords: 'ultra yards backyard' },
  // recording
  { label: 'Auto-pause', section: 'recording', keywords: 'pause stop lights traffic' },
  { label: 'Map style', section: 'recording', keywords: 'dark standard satellite 3d buildings' },
  { label: 'Keep the screen on (iPhone)', section: 'recording', keywords: 'wake lock screen lock gps iphone' },
  // sounds
  { label: 'Sounds & vibration', section: 'notifications', keywords: 'beeps haptics' },
  { label: 'Voice cues', section: 'notifications', keywords: 'spoken splits audio coach' },
  { label: 'Notifications', section: 'notifications', keywords: 'push alerts banners' },
  // goals
  { label: 'Daily step goal', section: 'goals', keywords: 'steps 10000' },
  { label: 'Daily active-calorie goal', section: 'goals', keywords: 'burn kcal move' },
  { label: 'Calorie & macro targets', section: 'goals', keywords: 'protein carbs fat water tdee fuel nutrition' },
  { label: 'Plans: Coach, weight loss, fasting, sleep, mind, ultra', section: 'goals', anchor: 'plans', keywords: 'setup program' },
  // devices
  { label: 'Bluetooth heart-rate strap', section: 'devices', keywords: 'polar garmin wahoo chest strap ble' },
  { label: 'Import watch files', section: 'devices', keywords: 'fit tcx gpx garmin coros apple watch' },
  { label: 'Strava', section: 'devices', keywords: 'connect sync' },
  { label: 'Spotify & music', section: 'devices', anchor: 'music', keywords: 'apple music playlist' },
  // messages
  { label: 'Read receipts', section: 'messages', keywords: 'seen' },
  { label: 'Activity status & typing', section: 'messages', keywords: 'online active now' },
  { label: 'Do not disturb (calls)', section: 'messages', anchor: 'calls', keywords: 'dnd ringing quiet' },
  { label: 'Protect my IP address in calls', section: 'messages', anchor: 'calls', keywords: 'relay turn' },
  // appearance
  { label: 'Theme: Light, Dark or System', section: 'appearance', anchor: 'theme', keywords: 'dark mode light mode night day appearance color colour display follow device automatic' },
  { label: 'Follow my device (automatic dark mode)', section: 'appearance', anchor: 'theme', keywords: 'system automatic night schedule' },
  // data
  { label: 'Export your data', section: 'data', keywords: 'backup json download' },
  { label: 'Import a HYBRD export', section: 'data', keywords: 'restore json' },
  { label: 'Sample data', section: 'data', keywords: 'demo' },
  { label: 'Delete everything', section: 'data', keywords: 'erase wipe remove account data' },
  // help / about
  { label: 'iPhone & GPS tips', section: 'help', keywords: 'install home screen battery' },
  { label: 'Sources', section: 'help', keywords: 'research citations' },
  { label: 'Community rules', section: 'help', keywords: 'guidelines report' },
  { label: 'Crisis lines (988)', section: 'help', keywords: 'help now suicide 911' },
  { label: 'Terms of Service', section: 'help', keywords: 'terms conditions tos legal agreement arbitration liability' },
  { label: 'Privacy Policy', section: 'help', keywords: 'privacy policy data cookies local storage ccpa gdpr rights' },
  { label: 'Consumer Health Data Privacy Policy', section: 'help', keywords: 'health data mhmda washington nevada connecticut' },
  { label: 'Disclaimer, DMCA and deletion policy', section: 'help', keywords: 'medical disclaimer copyright dmca delete account data deletion legal' },
  { label: 'Version', section: 'about', keywords: 'about build credits licence openstreetmap' },
];
export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);
export const itemPath = (i: SettingsItem) => `/settings/${i.section}${i.anchor ? `#${i.anchor}` : ''}`;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
/** Search sections and individual settings. Every word must match the label, section or keywords. */
export function searchSettings(q: string): { sections: SettingsSection[]; items: SettingsItem[] } {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return { sections: SECTIONS, items: [] };
  const hit = (hay: string) => words.every((w) => hay.includes(w));
  const sections = SECTIONS.filter((s) => hit(norm(`${s.title} ${s.sub}`)));
  const items = ITEMS.filter((i) => hit(norm(`${i.label} ${i.keywords || ''} ${sectionById(i.section)?.title || ''}`)));
  return { sections, items };
}

/** Old settings pages → their new home in Settings (old links keep working). */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/me/account': '/settings/account',
  '/me/devices': '/settings/devices',
  '/me/data': '/settings/data',
  '/me/help': '/settings/help',
  '/messages/settings': '/settings/messages',
};
