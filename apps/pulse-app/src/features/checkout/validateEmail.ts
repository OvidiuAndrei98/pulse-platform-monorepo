// Validate the value even when the billing step (and its input) is unmounted.
export function checkoutEmailError(value: string): string | null {
  const email = value.trim();
  if (!email) return "eventSheet.emailRequired";
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(email)
    ? null : "checkout.emailInvalid";
}
