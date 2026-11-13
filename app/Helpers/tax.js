// GST maths. All money is in whole paise (integers); the rate is a percentage such as 18 or 12.5.
//
// Razorpay charges the plan amount we send it, so for a plan that is NOT tax inclusive we send price + GST
// (grossUp), and the invoice then shows price as the subtotal and the difference as tax. For a tax-inclusive plan
// the price already contains GST and the invoice extracts it.

const toRate = (ratePercent) => {
  const rate = Number(ratePercent);
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
};

// price (without GST) -> price + GST
const grossUp = (pricePaise, ratePercent) => {
  const price = Math.round(Number(pricePaise));
  return price + Math.round((price * toRate(ratePercent)) / 100);
};

// the amount Razorpay should charge for a plan
const chargeAmountPaise = ({ pricePaise, taxInclusive }, ratePercent) =>
  Number(taxInclusive) === 1 ? Math.round(Number(pricePaise)) : grossUp(pricePaise, ratePercent);

// a total that contains GST -> { subtotalPaise, taxPaise }
const extractTax = (totalPaise, ratePercent) => {
  const total = Math.round(Number(totalPaise));
  const subtotal = Math.round((total * 100) / (100 + toRate(ratePercent)));
  return { subtotalPaise: subtotal, taxPaise: total - subtotal };
};

// The invoice total is ALWAYS what was actually charged. How it splits depends on the plan:
//   tax inclusive    -> GST is taken out of the total
//   tax exclusive    -> the base price is the subtotal and the rest of the total is GST
//                       (if the plan was synced before GST was added to its charge, total <= base price:
//                       there is no extra to call tax, so the total is split like an inclusive price)
const invoiceAmounts = ({ chargedPaise, basePricePaise, taxInclusive, ratePercent }) => {
  const total = Math.round(Number(chargedPaise));
  const base = Math.round(Number(basePricePaise));

  if (Number(taxInclusive) !== 1 && total > base) {
    return { subtotalPaise: base, taxPaise: total - base, totalPaise: total };
  }
  const { subtotalPaise, taxPaise } = extractTax(total, ratePercent);
  return { subtotalPaise, taxPaise, totalPaise: total };
};

module.exports = { grossUp, chargeAmountPaise, extractTax, invoiceAmounts };
