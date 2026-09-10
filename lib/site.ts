// Central site constants for SEO/metadata. Set NEXT_PUBLIC_SITE_URL to the live
// domain in the deploy environment; the fallback is the local dev origin.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.leasewiz.com.au").replace(/\/$/, "");
export const SITE_NAME = "LeaseWiz";
export const SITE_TAGLINE = "Novated Lease Explainer & Calculator";
export const SITE_DESCRIPTION =
  "Understand how an Australian novated lease actually works — pre-tax vs post-tax deductions, FBT and the employee contribution method, the electric vehicle exemption, running costs and the residual. See what a lease would really cost you against buying the same car outright.";
