# Shared-code migration manifest

The public imports below replace direct imports from application source. Paths are relative to the repository root. This is a source relocation/refactor; ticket prices, fee rates, permissions and payment confirmation policies are unchanged.

| Previous source | Package source | Public import |
| --- | --- | --- |
| `apps/pulse-app/src/features/admin/navigation.ts` | `packages/app-core/src/admin/navigation.ts` | `@packages/app-core/admin/navigation` |
| `apps/pulse-app/src/features/diagnostics/report.ts` | `packages/app-core/src/diagnostics/report.ts` | `@packages/app-core/diagnostics/report` |
| `apps/pulse-app/src/features/diagnostics/presentation.ts` | `packages/app-core/src/diagnostics/presentation.ts` | `@packages/app-core/diagnostics/presentation` |
| `apps/pulse-app/src/features/admin/commissions.ts` | `packages/app-core/src/admin/commissions.ts` | `@packages/app-core/admin/commissions` |
| `apps/pulse-app/src/features/admin/organizers.ts` | `packages/app-core/src/admin/organizers.ts` | `@packages/app-core/admin/organizers` |
| `apps/pulse-app/src/features/checkout/nativeReturn.ts` | `packages/app-core/src/checkout/nativeReturn.ts` | `@packages/app-core/checkout/nativeReturn` |
| `apps/pulse-app/src/features/checkout/organizerReturn.ts` | `packages/app-core/src/checkout/organizerReturn.ts` | `@packages/app-core/checkout/organizerReturn` |
| `apps/pulse-app/src/features/checkout/invoiceDetails.ts` | `packages/app-core/src/checkout/invoiceDetails.ts` | `@packages/app-core/checkout/invoiceDetails` |
| `apps/pulse-app/src/features/checkout/confirmation.ts` | `packages/app-core/src/checkout/confirmation.ts` | `@packages/app-core/checkout/confirmation` |
| `apps/pulse-app/src/features/events/serviceFee.ts` | `packages/app-core/src/events/serviceFee.ts` | `@packages/app-core/events/serviceFee` |
| `apps/pulse-app/src/features/events/promoPrice.ts` | `packages/app-core/src/events/promoPrice.ts` | `@packages/app-core/events/promoPrice` |
| `apps/pulse-app/src/features/checkout/ticketAvailability.ts` | `packages/app-core/src/checkout/ticketAvailability.ts` | `@packages/app-core/checkout/ticketAvailability` |
| `apps/pulse-app/src/i18n/resources.ts` | `packages/app-core/src/i18n/resources.ts` | `@packages/app-core/i18n/resources` |
| `apps/pulse-app/src/features/checkout/orderHistory.ts` | `packages/app-core/src/checkout/orderHistory.ts` | `@packages/app-core/checkout/orderHistory` |
| `apps/pulse-app/src/features/events/dashboardEvents.ts` | `packages/app-core/src/events/dashboardEvents.ts` | `@packages/app-core/events/dashboardEvents` |
| `apps/pulse-app/src/features/events/dashboardFeatured.ts` | `packages/app-core/src/events/dashboardFeatured.ts` | `@packages/app-core/events/dashboardFeatured` |
| `apps/pulse-app/src/features/events/form/dateTimeValues.ts` | `packages/app-core/src/events/dateTimeValues.ts` | `@packages/app-core/events/dateTimeValues` |
| `apps/pulse-app/src/features/events/form/editorSections.ts` | `packages/app-core/src/events/editorSections.ts` | `@packages/app-core/events/editorSections` |
| `apps/pulse-app/src/features/events/constants.ts` | `packages/app-core/src/events/constants.ts` | `@packages/app-core/events/constants` |
| `apps/pulse-app/src/components/tickets/ticketPdf.ts` | `packages/browser-core/src/tickets/ticketPdf.ts` | `@packages/browser-core/tickets/ticketPdf` |
| `apps/pulse-app/src/components/tickets/ticketPdfHtml.ts` | `packages/app-core/src/tickets/ticketPdfHtml.ts` | `@packages/app-core/tickets/ticketPdfHtml` |
| `apps/pulse-app/src/features/promotions/promotionBilling.ts` | `packages/app-core/src/promotions/promotionBilling.ts` | `@packages/app-core/promotions/promotionBilling` |
| `apps/pulse-app/src/features/diagnostics/context.ts` | `packages/app-core/src/diagnostics/context.ts` | `@packages/app-core/diagnostics/context` |
| `apps/pulse-app/src/features/events/map/openFreeMapDark.json` | `packages/app-core/src/events/map/openFreeMapDark.json` | `@packages/app-core/events/map/openFreeMapDark.json` |
| `apps/pulse-app/src/features/events/map/carouselGestures.ts` | `packages/app-core/src/events/map/carouselGestures.ts` | `@packages/app-core/events/map/carouselGestures` |
| `apps/pulse-app/src/components/notificationContent.ts` | `packages/app-core/src/notifications/content.ts` | `@packages/app-core/notifications/content` |
| `apps/pulse-app/src/core/mappers.ts` | `packages/app-core/src/events/categories.ts` | `@packages/app-core/events/categories` |
| `apps/pulse-app/src/components/social/organizerEvents.ts` | `packages/app-core/src/social/organizerEvents.ts` | `@packages/app-core/social/organizerEvents` |
| `apps/pulse-app/src/lib/auth/credentialFill.ts` | `packages/browser-core/src/auth/credentialFill.ts` | `@packages/browser-core/auth/credentialFill` |
| `apps/pulse-app/src/features/checkout/requestKey.ts` | `packages/app-core/src/checkout/requestKey.ts` | `@packages/app-core/checkout/requestKey` |
| `apps/pulse-app/src/features/checkout/validateEmail.ts` | `packages/app-core/src/checkout/validateEmail.ts` | `@packages/app-core/checkout/validateEmail` |
| `apps/pulse-app/src/features/events/discoveryFilters.ts` | `packages/app-core/src/events/discoveryFilters.ts` | `@packages/app-core/events/discoveryFilters` |
| `apps/pulse-app/src/features/events/promotions.ts` | `packages/app-core/src/events/promotions.ts` | `@packages/app-core/events/promotions` |
| `apps/pulse-app/src/features/events/dateFilters.ts` | `packages/app-core/src/events/dateFilters.ts` | `@packages/app-core/events/dateFilters` |
| `apps/pulse-app/src/features/events/types.ts` | `packages/app-core/src/events/types.ts` | `@packages/app-core/events/types` |
| `apps/pulse-app/src/features/legal/publicLegalDocuments.ts` | `packages/app-core/src/legal/publicLegalDocuments.ts` | `@packages/app-core/legal/publicLegalDocuments` |
| `apps/pulse-app/src/components/ui/drawerDesign.ts` | `packages/app-core/src/presentation/drawerDesign.ts` | `@packages/app-core/presentation/drawerDesign` |
| `apps/pulse-app/src/components/social/feedTypes.ts` | `packages/app-core/src/social/feedTypes.ts` | `@packages/app-core/social/feedTypes` |
| `apps/pulse-app/src/components/social/groupFeedItems.ts` | `packages/app-core/src/social/groupFeedItems.ts` | `@packages/app-core/social/groupFeedItems` |
| `apps/pulse-app/src/features/wardrobe/flow.ts` | `packages/app-core/src/wardrobe/flow.ts` | `@packages/app-core/wardrobe/flow` |
| `apps/pulse-app/src/features/wardrobe/model.ts` | `packages/app-core/src/wardrobe/model.ts` | `@packages/app-core/wardrobe/model` |
| `apps/pulse-app/src/features/wardrobe/tabNavigation.ts` | `packages/app-core/src/wardrobe/tabNavigation.ts` | `@packages/app-core/wardrobe/tabNavigation` |
| `apps/pulse-app/src/features/legal/types.ts` | `packages/app-core/src/legal/types.ts` | `@packages/app-core/legal/types` |
| `apps/spottr-native/src/map/geometry.ts` | `packages/app-core/src/maps/geometry.ts` | `@packages/app-core/maps/geometry` |
| `apps/pulse-app/src/features/events/map/openFreeMapLicense.txt` | `packages/app-core/src/events/map/openFreeMapLicense.txt` | `@packages/app-core/events/map/openFreeMapLicense.txt` |

## Splits and new shared modules

- `app-core/tickets/design`: platform-independent printable-ticket contract, date formatting and escaping split from the Web email-template adapter. The canonical email template remains in its existing backend-synchronized location.
- `app-core/events/dateFormat`: the language is an explicit argument; callers use their own application i18n instance.
- `app-core/auth/credentialFill`: pure submission coordination; DOM observation lives in `browser-core/auth/credentialFill`.
- `app-core/checkout/totals`: shared ticket/discount/fee presentation calculations. Golden tests compare against the previous per-unit rounding and fee calculation. The server remains authoritative.
- `app-core/async/actionGate`: scoped exclusive action leases, used by Web admin cancellation retry to reject duplicate or obsolete results.
- `browser-core/maps/vectorMap`: imperative MapLibre engine split from the Web React component. Web and Native-web have separate small React lifecycle adapters so they use their own React version.
- `api-client/schema-types`: shared type-only schema projection; transport imports use `api-client/client`. No consumer imports `api-client/src/*`.

## Application component splits

| Application | Controller | Presentation |
| --- | --- | --- |
| Web checkout | `features/checkout/useTicketCheckout.ts` | `TicketCheckoutDrawer.tsx`, `presentation/Checkout{Tickets,Billing,Summary}Step.tsx`, primitives |
| Web scanner | `features/scanner/useTicketValidation.ts` | route view, `features/scanner/presentation/*`, controller contracts |
| Web admin operations | `app/admin/useAdminOperations.ts` | `OperationsPage.tsx`, `app/admin/presentation/*`, controller contracts |
| Native checkout | `checkout/useCheckoutController.ts` | `screens/CheckoutScreen.tsx`, `checkout/presentation/*`, controller contracts |
| Native scanner | `scanner/useScannerController.ts` | `scanner/ScannerScreen.tsx`, `scanner/presentation/ScannerAdmissionPanel.tsx` |
| Native admin | `admin/useAdminController.ts` | `admin/AdminScreen.tsx`, `admin/presentation/*`, controller contracts |

Controller paths above are relative to each application's `src`. UI layouts, translations and Liquid Glass components are preserved. These controllers orchestrate platform effects; they are not domain packages. Contracts restrict each child view to the state/actions it needs.

