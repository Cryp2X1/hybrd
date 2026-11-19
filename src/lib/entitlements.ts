// Feature flags / entitlements. Everything in HYBRD is FREE today — this layer only exists so features can be
// gated later (e.g. a "premium" HYBRD Coach) without touching every screen. See APP-BUILDER-NOTES.md › "Premium later".
//
// Rules for now:
//  - Every feature below has `free: true`, so `can()` always returns true.
//  - Do NOT show paywalls, prices or "Premium" badges anywhere in the UI.
//  - To gate a feature later: flip its `free` to false and make `getEntitlements()` return the real state
//    (Stripe customer portal / webhooks on the web, RevenueCat or StoreKit / Play Billing in a native app).
export type Feature =
  | 'coach.plan' // build a personalised plan from the intake
  | 'coach.regenerate' // rebuild / change answers
  | 'coach.edit' // move days, swap sessions, change a day's length
  | 'coach.checkin' // weekly check-in + automatic adjustments
  | 'coach.nutrition' // calorie / macro / hydration targets
  | 'coach.mealplan' // 7-day meal plan + logging to Fuel
  | 'coach.why' // "Why this plan" explanations
  | 'fasting.plan' // fasting screening + personalised protocol and eating window
  | 'fasting.timer' // live fasting timer, stages, eating-window countdown
  | 'fasting.history' // fasting log, streaks and weekly view
  | 'fasting.research' // protocol library, tips and research
  | 'sleep.plan' // sleep safety screen + personal evening fuel timeline
  | 'sleep.caffeine' // caffeine tracker + bedtime estimate
  | 'sleep.log' // sleep & fuel log, trends and streaks
  | 'sleep.recipes' // sleep snacks & drinks
  | 'sleep.research' // graded evidence library + sources
  | 'mind.checkin' | 'mind.breathe' | 'mind.programs' | 'mind.recovery' | 'mind.journal' | 'mind.trends' | 'mind.screening' | 'mind.research' // Mind & Recovery
  | 'profile.avatar' // profile photo (upload / camera, crop, remove)
  | 'gallery.photos' // private photo gallery: upload, tags, captions, viewer
  | 'gallery.download' // download originals / ZIP of selected or all
  | 'gallery.compare' // before / after side-by-side compare
  | 'gallery.videos' // gallery videos: upload / record, poster + duration, player, download, location tags removed
  | 'profile.bio' // Me › Bio (free-form text)
  | 'ultra.plan' | 'ultra.backyardTimer' | 'ultra.fueling' | 'ultra.prep' | 'ultra.research' // Train › Ultra & Backyard
  | 'social.profile' | 'social.friends' | 'social.invite' | 'social.posts' | 'social.stories' | 'social.reactions' | 'social.saved' | 'social.notifications' | 'social.safety' // Social: Friends & Stories
  | 'messages.direct' | 'messages.requests' | 'messages.groups' | 'messages.media' | 'messages.reactions' | 'messages.privacy' | 'messages.safety' // Messages (DMs)
  | 'calls.voice' | 'calls.video' | 'calls.group' | 'calls.safety'; // Calls in Messages

export interface FeatureInfo { free: boolean; label: string }
export const FEATURES: Record<Feature, FeatureInfo> = {
  'coach.plan': { free: true, label: 'Personal training plan' },
  'coach.regenerate': { free: true, label: 'Regenerate / change answers' },
  'coach.edit': { free: true, label: 'Edit, move and swap sessions' },
  'coach.checkin': { free: true, label: 'Weekly check-in & adjustments' },
  'coach.nutrition': { free: true, label: 'Nutrition targets' },
  'coach.mealplan': { free: true, label: '7-day meal plan' },
  'coach.why': { free: true, label: 'Why this plan' },
  'fasting.plan': { free: true, label: 'Personal fasting plan' },
  'fasting.timer': { free: true, label: 'Fasting timer' },
  'fasting.history': { free: true, label: 'Fasting history & streaks' },
  'fasting.research': { free: true, label: 'Fasting protocols & research' },
  'sleep.plan': { free: true, label: 'Personal evening sleep plan' },
  'sleep.caffeine': { free: true, label: 'Caffeine tracker & bedtime estimate' },
  'sleep.log': { free: true, label: 'Sleep & fuel log, trends and streaks' },
  'sleep.recipes': { free: true, label: 'Sleep snacks & drinks' },
  'sleep.research': { free: true, label: 'Sleep nutrition evidence & sources' },
  'mind.checkin': { free: true, label: 'Daily check-in & readiness' },
  'mind.breathe': { free: true, label: 'Guided breathing' },
  'mind.programs': { free: true, label: 'Mental-skills programs' },
  'mind.recovery': { free: true, label: 'Recovery toolkit & planner' },
  'mind.journal': { free: true, label: 'Private journal' },
  'mind.trends': { free: true, label: 'Mind trends, streaks & patterns' },
  'mind.screening': { free: true, label: 'Well-being check-ups (WHO-5, PHQ-4)' },
  'mind.research': { free: true, label: 'Mind & recovery evidence & sources' },
  'profile.avatar': { free: true, label: 'Profile photo' },
  'gallery.photos': { free: true, label: 'Photo gallery' },
  'gallery.download': { free: true, label: 'Download photos' },
  'gallery.compare': { free: true, label: 'Before / after compare' },
  'gallery.videos': { free: true, label: 'Gallery videos' },
  'profile.bio': { free: true, label: 'Profile bio' },
  'ultra.plan': { free: true, label: 'Ultra & backyard training plan' },
  'ultra.backyardTimer': { free: true, label: 'Backyard lap timer' },
  'ultra.fueling': { free: true, label: 'Race fuelling & hydration planner' },
  'ultra.prep': { free: true, label: 'Race prep checklists & recovery' },
  'ultra.research': { free: true, label: 'Ultra research & sources' },
  'social.profile': { free: true, label: 'Public profile & handle' },
  'social.friends': { free: true, label: 'Friends: requests, unfriend, block' },
  'social.invite': { free: true, label: 'Invite links' },
  'social.posts': { free: true, label: 'Posts with photos & workout cards' },
  'social.stories': { free: true, label: '24-hour stories' },
  'social.reactions': { free: true, label: 'Likes, comments & shares' },
  'social.saved': { free: true, label: 'Saved posts' },
  'social.notifications': { free: true, label: 'Notifications' },
  'social.safety': { free: true, label: 'Report, block & hide (always free)' },
  'messages.direct': { free: true, label: 'Private 1:1 messages' },
  'messages.requests': { free: true, label: 'Message requests from non-friends' },
  'messages.groups': { free: true, label: 'Group chats (up to 32 people)' },
  'messages.media': { free: true, label: 'Photos, videos & workout cards in chats' },
  'messages.reactions': { free: true, label: 'Reactions, replies, edit & unsend' },
  'messages.privacy': { free: true, label: 'Who can message me, read receipts, activity status' },
  'messages.safety': { free: true, label: 'Block, report & request filtering (always free)' },
  'calls.voice': { free: true, label: 'Voice calls in Messages' },
  'calls.video': { free: true, label: 'Video calls in Messages' },
  'calls.group': { free: true, label: 'Group calls (up to 4 people)' },
  'calls.safety': { free: true, label: 'Who can call me, Do not disturb, report from a call (always free)' },
};

export interface Entitlements { premium: boolean; source: 'none' | 'stripe' | 'revenuecat' | 'promo' }
/** Today there is no purchase flow, so nobody is premium — and nothing needs it. */
export function getEntitlements(): Entitlements { return { premium: false, source: 'none' }; }
/** Can the current user use this feature? Free features are always available. */
export function can(f: Feature, e: Entitlements = getEntitlements()): boolean { return FEATURES[f].free || e.premium; }
/** Features that would need premium if the flags were flipped (empty today). */
export const premiumOnly = (): Feature[] => (Object.keys(FEATURES) as Feature[]).filter((f) => !FEATURES[f].free);
