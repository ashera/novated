// Shared FAQ content — rendered on /faq (with FAQPage JSON-LD) and inlined into
// /llms.txt so AI assistants can read the answers directly.
export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "What is a novated lease?",
    a: "A novated lease is a three-way agreement between you, your employer and a financier. The financier owns and leases the car, and your employer takes the lease payments straight out of your salary and pays them on your behalf. The car is yours to use, but the obligation to pay sits with your employer for as long as you work there. The point of the arrangement is that most of the payment comes out of your salary BEFORE income tax is calculated, so a car that would otherwise be bought with after-tax dollars is partly funded with pre-tax ones.",
  },
  {
    q: "How does a novated lease save you tax?",
    a: "By moving the cost from after tax to before tax. If you earn $110,000 and package $12,000 of car costs, you are taxed as if you earned $98,000. At a 32% marginal rate (30% plus the Medicare levy) that is roughly $3,840 of tax you never pay. The saving is worth more the higher your marginal rate, which is why novated leasing suits higher earners more than it does someone near the tax-free threshold. There is a second saving too: the financier claims the GST on the car and on packaged running costs, so you effectively buy them GST-free.",
  },
  {
    q: "What is FBT and why does it matter on a novated lease?",
    a: "Providing an employee with a car for private use is a fringe benefit, and the employer is taxed on it. Under the statutory formula, the taxable value is a flat 20% of the car's GST-inclusive price each year, and FBT is charged at 47% on that value once it is grossed up — which would wipe out the tax saving entirely. In practice that is avoided rather than paid, either because the car is an FBT-exempt EV or because you use the employee contribution method.",
  },
  {
    q: "What is the employee contribution method (ECM)?",
    a: "ECM is the standard way of dealing with FBT. You pay part of the package — an amount equal to the FBT taxable value, so 20% of the car's price — from your POST-tax salary. Doing that reduces the FBT taxable value to nil, so no FBT is payable at all. The trade-off is that those post-tax dollars get no tax relief. Everything else in the package still comes out pre-tax, so the overall arrangement usually remains well ahead.",
  },
  {
    q: "Are electric vehicles exempt from FBT?",
    a: "Battery-electric and hydrogen fuel-cell vehicles that were first held and used on or after 1 July 2022 and cost at or below the luxury car tax threshold for fuel-efficient vehicles are exempt from FBT. That is what makes an EV novated lease so much stronger than a petrol one: with no FBT there is no employee contribution, so the entire package — lease payments, charging, servicing, tyres, registration and insurance — comes out of pre-tax salary. Plug-in hybrids lost eligibility on 1 April 2025 unless a binding commitment was already in place. Note that even an exempt car still creates a reportable fringe benefit on your payment summary.",
  },
  {
    q: "What is the residual (or balloon) payment?",
    a: "The residual is the amount still owing on the car at the end of the lease. The ATO sets minimum residuals by term — 65.63% of the financed amount after one year, down to 28.13% after five. It is not optional: at the end of the term you either pay it out and own the car, refinance it into a new lease, or sell the car and cover any shortfall yourself. The residual is the part of novated leasing people are most often surprised by, so it is worth knowing the number before you sign.",
  },
  {
    q: "What happens if I leave my job?",
    a: "The novation ends. The lease itself does not — it reverts to you personally, and you keep paying it from your after-tax income until a new employer agrees to take on the novation. If your next employer does not offer novated leasing, or your circumstances change, you are left funding the full lease with post-tax dollars, which is materially more expensive than the arrangement you signed up for.",
  },
  {
    q: "Does a novated lease affect anything else?",
    a: "Yes. The grossed-up value of the benefit appears on your payment summary as a reportable fringe benefits amount. It is not taxable income, but it counts towards several income tests: the Medicare levy surcharge, your HELP/HECS repayment income, child support assessments, and family assistance payments such as Family Tax Benefit. For someone with a study loan or receiving family payments, that can eat into the saving, which is why this calculator asks about a HELP debt.",
  },
  {
    q: "Is a novated lease cheaper than just buying the car?",
    a: "It depends on your marginal tax rate, the car, and the interest rate the financier charges. The tax and GST savings are real, but so are the financier's interest margin and the management fees, and those are often not disclosed clearly. A high earner leasing an FBT-exempt EV usually comes out well ahead of a car loan. A lower earner leasing a petrol car at an undisclosed high interest rate often does not. The honest answer is to compare the total cost over the same term, against the same residual — which is what this tool does.",
  },
  {
    q: "What can be packaged into the lease besides the car?",
    a: "Typically fuel or charging, scheduled servicing, tyres, registration and CTP, comprehensive insurance and roadside assistance. These are budgeted across the term and deducted with the lease payment, which means they also come out of pre-tax salary and are effectively bought GST-free. Anything not packaged you simply pay for yourself, with GST, out of take-home pay — so packaging running costs is usually where a meaningful part of the saving comes from.",
  },
  {
    q: "Do I need my employer's agreement?",
    a: "Yes. Novated leasing only works if your employer will deduct the payments and pay the financier, and many employers use a single nominated lease provider. Some cap what can be packaged or add their own administration fee. Before you get attached to a quote, check what your payroll or HR team actually supports.",
  },
  {
    q: "What is the luxury car tax threshold and how does it apply?",
    a: "Luxury car tax is charged at 33% on the value of a car above the threshold. There are two thresholds: a higher one for fuel-efficient vehicles and a lower one for everything else. The fuel-efficient threshold does double duty — it is also the price cap for the FBT exemption on electric vehicles, so an EV priced a dollar above it loses the exemption entirely. There is a separate figure, the car limit, that caps how much GST the financier can claim back on the vehicle.",
  },
];
