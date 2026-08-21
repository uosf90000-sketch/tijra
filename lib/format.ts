const sar = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("ar-SA", {
  maximumFractionDigits: 2,
});

export function formatSar(value: number) {
  return sar.format(value);
}

export function formatNumber(value: number) {
  return number.format(value);
}
