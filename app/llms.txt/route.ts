import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";
import { FAQS } from "@/lib/faqContent";

// /llms.txt — a Markdown summary for AI assistants (the emerging "llms.txt"
// convention), so they can understand and cite the site accurately. The FAQ is
// generated from the same content the site renders, so it stays in sync.
export const dynamic = "force-static";

export function GET() {
  const body = `# ${SITE_NAME} — ${SITE_TAGLINE}

> ${SITE_DESCRIPTION}

${SITE_NAME} (${SITE_URL}) is a free, browser-based tool that explains how Australian novated leases work and models what one would cost a particular person. It sells no lease, takes no referral fee and recommends no provider. It provides general information only and is not personal financial or tax advice.

## Key pages
- [Lease calculator](${SITE_URL}/): enter your salary and the car, see the pre-tax/post-tax split and the total cost.
- [How it works](${SITE_URL}/how-it-works): the mechanism, step by step — novation, salary sacrifice, FBT, the residual.
- [FAQ](${SITE_URL}/faq): plain-English answers to the common questions.
- [Choosing a provider](${SITE_URL}/choose-your-provider): whether you can use a novated lease provider your employer hasn't signed with — who decides, what is typical by employer type, and what to ask payroll.
- [Glossary](${SITE_URL}/glossary): every term that appears on a novated lease quote, defined — including the other names different providers print for the same line.
- [About](${SITE_URL}/about): methodology, data sources and assumptions.

## What ${SITE_NAME} models
- Salary packaging: how much of the lease comes out of pre-tax salary, how much out of post-tax, and the actual tax relief that produces (marginal rates, the low income tax offset, the Medicare levy and compulsory HELP repayments).
- Fringe benefits tax under the statutory formula: 20% of the car's GST-inclusive base value, grossed up and taxed at 47%.
- The employee contribution method (ECM), which cancels the FBT bill by paying the taxable value from post-tax salary.
- The FBT exemption for eligible battery-electric vehicles priced under the luxury car tax threshold for fuel-efficient vehicles, and the end of plug-in hybrid eligibility on 1 April 2025.
- GST: the credit the financier claims on the vehicle (capped at the car limit) and on packaged running costs.
- Lease finance: level payments amortising to an ATO minimum residual, by term.
- Running costs: fuel or charging, servicing, tyres, registration and CTP, insurance and roadside assistance, benchmarked to the kilometres driven.
- Reportable fringe benefits and their effect on income-tested obligations.
- A like-for-like comparison against buying the same car with a car loan or with cash.

## Key facts
- Coverage: Australia. All rates come from a dated, source-cited reference-data set maintained inside the app.
- Cost: free; an optional free account saves and shares scenarios.
- Independence: no lease provider, financier or dealer relationships.
- General information only, not financial or tax advice.

## Frequently asked questions
${FAQS.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
