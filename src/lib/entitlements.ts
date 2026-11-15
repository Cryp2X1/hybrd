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
  | 'coach.why'; // "Why this plan" explanations

export interface FeatureInfo { free: boolean; label: string }
export const FEATURES: Record<Feature, FeatureInfo> = {
  'coach.plan': { free: true, label: 'Personal training plan' },
  'coach.regenerate': { free: true, label: 'Regenerate / change answers' },
  'coach.edit': { free: true, label: 'Edit, move and swap sessions' },
  'coach.checkin': { free: true, label: 'Weekly check-in & adjustments' },
  'coach.nutrition': { free: true, label: 'Nutrition targets' },
  'coach.mealplan': { free: true, label: '7-day meal plan' },
  'coach.why': { free: true, label: 'Why this plan' },
};

export interface Entitlements { premium: boolean; source: 'none' | 'stripe' | 'revenuecat' | 'promo' }
/** Today there is no purchase flow, so nobody is premium — and nothing needs it. */
export function getEntitlements(): Entitlements { return { premium: false, source: 'none' }; }
/** Can the current user use this feature? Free features are always available. */
export function can(f: Feature, e: Entitlements = getEntitlements()): boolean { return FEATURES[f].free || e.premium; }
/** Features that would need premium if the flags were flipped (empty today). */
export const premiumOnly = (): Feature[] => (Object.keys(FEATURES) as Feature[]).filter((f) => !FEATURES[f].free);
