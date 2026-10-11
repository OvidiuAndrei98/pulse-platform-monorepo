import type { PaymentSheet } from '@stripe/stripe-react-native';
import type { InvoiceDetails } from '../../../pulse-app/src/features/checkout/invoiceDetails';
import { STRIPE_RETURN_URL, type NativePaymentSession } from './nativePayment';

export function paymentSheetOptions(session: NativePaymentSession, email: string, details: InvoiceDetails,
  wallets: { applePay: boolean; googlePay: boolean }): PaymentSheet.SetupParams {
  const name = details.country.trim().toLowerCase();
  const country = ['romania', 'românia', 'ro'].includes(name) ? 'RO' : /^[a-z]{2}$/.test(name) ? name.toUpperCase() : undefined;
  return {
    merchantDisplayName: 'SPOTTR', paymentIntentClientSecret: session.paymentIntentClientSecret,
    returnURL: STRIPE_RETURN_URL, style: 'alwaysDark', allowsDelayedPaymentMethods: false,
    defaultBillingDetails: { name: details.name, email, address: { country, city: details.city, line1: details.address, state: details.county } },
    ...(wallets.applePay ? { applePay: { merchantCountryCode: 'RO' } } : {}),
    ...(wallets.googlePay ? { googlePay: { merchantCountryCode: 'RO', currencyCode: 'RON', testEnv: session.publishableKey.startsWith('pk_test_') } } : {}),
    appearance: {
      colors: { primary: '#ff0044', background: '#1b1b1d', componentBackground: '#29292c', componentBorder: '#444448',
        componentDivider: '#444448', primaryText: '#ffffff', secondaryText: '#a1a1aa', componentText: '#ffffff', placeholderText: '#9f9fa9', icon: '#a1a1aa', error: '#ff536d' },
      shapes: { borderRadius: 16, borderWidth: 1 },
      primaryButton: { colors: { background: '#ff0044', text: '#ffffff', border: '#ff0044' }, shapes: { borderRadius: 24, height: 48 } },
    },
  };
}
