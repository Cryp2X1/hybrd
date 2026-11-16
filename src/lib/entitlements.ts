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
  | 'profile.avatar' // profile photo (upload / camera, crop, remove)
  | 'gallery.photos' // private photo gallery: upload, tags, captions, viewer
  | 'gallery.download' // download originals / ZIP of selected or all
  | 'gallery.compare' // before / after side-by-side compare
  | 'profile.bio' // Me › Bio (free-form text)
  | 'ultra.plan' | 'ultra.backyardTimer' | 'ultra.fueling' | 'ultra.prep' | 'ultra.research' // Train › Ultra & Backyard
  | 'social.profile' | 'social.friends' | 'social.invite' | 'social.posts' | 'social.stories' | 'social.reactions' | 'social.saved' | 'social.notifications' | 'social.safety'; // Social: Friends & Stories

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
  'profile.avatar': { free: true, label: 'Profile photo' },
  'gallery.photos': { free: true, label: 'Photo gallery' },
  'gallery.download': { free: true, label: 'Download photos' },
  'gallery.compare': { free: true, label: 'Before / after compare' },
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
};

export interface Entitlements { premium: boolean; source: 'none' | 'stripe' | 'revenuecat' | 'promo' }
/** Today there is no purchase flow, so nobody is premium — and nothing needs it. */
export function getEntitlements(): Entitlements { return { premium: false, source: 'none' }; }
/** Can the current user use this feature? Free features are always available. */
export function can(f: Feature, e: Entitlements = getEntitlements()): boolean { return FEATURES[f].free || e.premium; }
/** Features that would need premium if the flags were flipped (empty today). */
export const premiumOnly = (): Feature[] => (Object.keys(FEATURES) as Feature[]).filter((f) => !FEATURES[f].free);
