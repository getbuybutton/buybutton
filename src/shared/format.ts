const SUB = '₀₁₂₃₄₅₆₇₈₉'

// $0.0₄1234 style for tiny prices, 4 significant digits otherwise.
export function formatPrice(p: number): string {
  if (!isFinite(p) || p <= 0) return '—'
  if (p >= 1) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: p >= 1000 ? 0 : 2 })
  const zeros = Math.floor(-Math.log10(p))
  if (zeros >= 4) {
    const digits = Math.round(p * 10 ** (zeros + 3)).toString().slice(0, 4)
    return '$0.0' + String(zeros - 1).split('').map((d) => SUB[+d]).join('') + digits
  }
  return '$' + p.toPrecision(4)
}

export function formatUsdCompact(v: number | null): string {
  if (v == null || !isFinite(v)) return '—'
  return '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

// +12.3% / −8.1% / +1,250%: one decimal under 100%, none above.
// Changes that round to 0.0 have no direction: "0.0%", never "−0.0%".
export const flatChange = (pct: number) => Math.abs(pct) < 0.05

export function formatChange(pct: number): string {
  if (flatChange(pct)) return '0.0%'
  const sign = pct >= 0 ? '+' : '−'
  const a = Math.abs(pct)
  return sign + (a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toFixed(1)) + '%'
}
