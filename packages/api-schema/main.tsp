import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3";

using TypeSpec.Http;
using TypeSpec.Rest;

@service
@server("https://api.pulse-app.local/v1", "Local development server")
namespace Pulse;

model ApiError {
  message: string;
}

model User {
  id: string;
  username: string;
  email: string;
  role: "user" | "organizer" | "admin";
  avatarUrl?: string;
  bio?: string;
  showAttendancePublicly: boolean;
  createdAt: utcDateTime;
}

model CurrentUser extends User {
  hasPassword: boolean;
}

model UserMinResponse {
  id: string;
  username: string;
  avatarUrl?: string;
}

model BillingDetails {
  type: "individual" | "company";
  name: string;
  taxId: string;
  registrationNumber: string;
  address: string;
  city: string;
  county: string;
  sector: string;
  country: string;
}

model SavedBillingDetailsResponse {
  details?: BillingDetails;
}

// --- MODELELE UNIFICATE (ALINIATE CU GO / POSTGRESQL) ---

model TicketTypeResponse {
  id: string;
  name: string;
  priceRon: int32;
  capacity: int32;
  startSales: utcDateTime;
  endSales: utcDateTime;
  description?: string;

  // Vizibil DOAR pentru organizator în dashboard (MapFromDBListEventsWithStats / MapFromDBGetEventWithStats)
  ticketsSold?: int32;
}

model Artist {
  id: string;
  name: string;
  imageUrl: string;
  stage?: string;
  performanceTime?: string;
  spotifyUrl?: string;
  isHeadliner: boolean;
  source: "SPOTIFY" | "MANUAL";
}

model ArtistInput {
  name: string;
  imageUrl?: string;
  stage?: string;
  performanceTime?: string;
  spotifyUrl?: string;
  isHeadliner?: boolean;
  source: "SPOTIFY" | "MANUAL";
}

model SpotifyArtistResponse {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  spotifyUrl: string;
}

model EventStatsResponse {
  totalCheckIns: int64;

  // Vizibil public când utilizatorul este autentificat (MapFromDBListEvents / MapFromDBGetEvent)
  userHasCheckedIn?: boolean;
  isFavorited?: boolean;

  // Vizibile DOAR pentru organizator în dashboard
  totalTicketsSold?: int64;

  totalRevenueRon?: int64;
  interestedCount?: int64;
  goingCount?: int64;
  ticketHolderCount?: int64;
}

model FriendEventActivityResponse {
  id: string;
  username: string;
  avatarUrl?: string;
  status: "interested" | "going" | "has_ticket";
}

model EventSocialResponse {
  interestedCount: int64;
  goingCount: int64;
  ticketHolderCount: int64;
  ticketsSoldCount: int64;
  manualGoingCount: int64;
  currentUserStatus: "none" | "interested" | "going" | "has_ticket";
  friends: FriendEventActivityResponse[];
}

model UpdateEventRsvpPayload {
  status: "interested" | "going";
}

model PublicProfileResponse {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  preferredLanguage: "en" | "ro";
  role: "user" | "organizer" | "admin";
  organizerName?: string;
  organizerVerified: boolean;
  relationship: "none" | "self" | "pending_sent" | "pending_received" | "friends";
  followsOrganizer: boolean;
  followerCount: int64;
  eventCount: int64;
  ticketsSoldCount: int64;
}

model EventAttendeeResponse extends PublicProfileResponse {
  attendanceStatus: "going" | "has_ticket";
}

model SocialFeedItemResponse {
  activityType: "friend_ticket" | "friend_going" | "organizer_event" | "organizer_update";
  occurredAt: utcDateTime;
  actorId: string;
  actorUsername: string;
  actorAvatarUrl?: string;
  eventId: string;
  eventTitle: string;
  eventBannerUrl?: string;
  eventStartTime: utcDateTime;
  organizerName?: string;
  organizerUpdateId?: string;
  organizerUpdateImageUrl?: string;
  organizerUpdateCaption?: string;
}

model OrganizerEventUpdateResponse {
  id: string;
  eventId: string;
  organizerId: string;
  eventTitle: string;
  imageUrl: string;
  caption?: string;
  createdAt: utcDateTime;
  expiresAt: utcDateTime;
}

model CreateOrganizerEventUpdatePayload {
  imageUrl: string;
  caption?: string;
}

model NotificationResponse {
  id: string;
  type: string;
  title: string;
  body: string;
  eventId?: string;
  actorId?: string;
  actorUsername?: string;
  actorAvatarUrl?: string;
  isRead: boolean;
  createdAt: utcDateTime;
}

model PasswordResetRequest {
  email: string;
}

model PasswordResetPayload {
  token: string;
  newPassword: string;
}

model MessageResponse {
  message: string;
}

model NotificationListResponse {
  items: NotificationResponse[];
  unreadCount: int64;
}

model SafetyGroupMemberResponse {
  userId: string;
  username: string;
  avatarUrl?: string;
  status: "pending" | "accepted";
}

model SafetyGroupMessageResponse {
  id: string;
  senderId: string;
  senderUsername: string;
  senderAvatarUrl?: string;
  kind: "message" | "help" | "help_resolved" | "system";
  content: string;
  createdAt: utcDateTime;
}

model EligibleSafetyFriendResponse {
  userId: string;
  username: string;
  avatarUrl?: string;
}

model EventSafetyGroupResponse {
  id: string;
  eventId: string;
  eventTitle: string;
  eventLocation: string;
  startTime: utcDateTime;
  endTime: utcDateTime;
  expiresAt: utcDateTime;
  ownerId: string;
  currentMemberStatus: "pending" | "accepted";
  canSendHelp: boolean;
  currentUserNeedsHelp: boolean;
  members: SafetyGroupMemberResponse[];
  messages: SafetyGroupMessageResponse[];
}

model EventSafetyGroupEnvelopeResponse {
  canCreate: boolean;
  ticketValidated: boolean;
  group?: EventSafetyGroupResponse;
  eligibleFriends: EligibleSafetyFriendResponse[];
}

model CreateEventSafetyGroupPayload {
  friendIds: string[];
}

model SafetyGroupInviteResponsePayload {
  status: "accepted" | "declined";
}

model SafetyGroupMessagePayload {
  content: string;
}

model CreatedResourceResponse {
  id: string;
}

model SuccessResponse {
  success: boolean;
}

model EventResponse {
  id: string;
  organizerId: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  bannerUrl?: string;
  googlePlaceId: string;
  locationName: string;
  city: string;
  vibe: string;
  organizerAbsorbsServiceFee: boolean;
  vatPercentage?: float64;
  externalTicketUrl?: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  publishAt?: utcDateTime;
  isLive: boolean;
  createdAt: utcDateTime;

  // Răspunsul include întotdeauna colecțiile dedicate, controlate intern prin pointeri în Go
  ticketTypes: TicketTypeResponse[];
  lineup: Artist[];

  stats: EventStatsResponse;
}

// --------------------------------------------------------

model CheckIn {
  id: string;
  eventId: string;
  userId: string;
  checkInTime: utcDateTime;
}

model Comment {
  id: string;
  content: string;
  createdAt: utcDateTime;
  username: string;
  avatarUrl?: string;
}

model OrganizerProfile {
  id: string;
  userId: string;
  companyName: string;
  cui: string;
  fiscalAddress: string;
  isVerified: boolean;
  verificationStatus: "pending" | "approved" | "rejected";
  caenCode?: string;
  stripeAccountId?: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  organizerAgreementVersion?: string;
  organizerAgreementAcceptedAt?: utcDateTime;
  createdAt: utcDateTime;
}

model StripeAccountLinkResponse {
  url: string;
}

model UserTicketResponse {
  ticketPriceBani: int64;
  ticketingFeeBani: int64;
  paidTotalBani: int64;
  vatPercentage?: float64;
  vatAmountBani?: int64;
  id: string;
  eventId: string;
  validationHash: string;
  isValidated: boolean;
  validatedAt?: utcDateTime;
  ticketTypeName: string;
  eventTitle: string;
  locationName: string;
  startTime: utcDateTime;
  endTime: utcDateTime;
  priceRon: int32;
  organizerCompanyName: string;
  organizerCui: string;
  organizerFiscalAddress: string;
}

// --- REQUEST BODY PAYLOADS ---

model UserRegisterPayload {
  username: string;
  email: string;
  password: string;
  requestOrganizerRole?: boolean;
  companyName?: string;
  cui?: string;
}

model OrganizerVerificationRequest {
  userId: string;
  username: string;
  email: string;
  cui: string;
  companyName: string;
  fiscalAddress?: string;
  verificationStatus: "pending" | "approved" | "rejected";
  submittedAt: utcDateTime;
  updatedAt: utcDateTime;
  verifiedAt?: utcDateTime;
  stripeAccountId?: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeChargeType?: string;
}

model ReviewOrganizerVerificationPayload {
  status: "approved" | "rejected";
}

model CreateEventCancellationPayload {
  reason: string;
  evidenceUrl?: string;
}

model ReviewEventCancellationPayload {
  feePolicy?: "retain" | "refund";
  adminNote?: string;
}

model EventCancellationRequestResponse {
  id: string;
  eventId: string;
  organizerId: string;
  eventTitle?: string;
  organizerEmail?: string;
  companyName?: string;
  previousEventStatus: string;
  reason: string;
  evidenceUrl?: string;
  status: "pending" | "refunding" | "completed" | "rejected" | "failed";
  feePolicy?: "retain" | "refund";
  adminNote?: string;
  startTime?: utcDateTime;
  orderCount?: int64;
  ticketCount?: int64;
  customerTotalBani?: int64;
  platformFeeBani?: int64;
  alreadyRefundedBani?: int64;
  succeededRefunds?: int64;
  pendingRefunds?: int64;
  failedRefunds?: int64;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model UserLoginPayload {
  email: string;
  password: string;
}

model CreateEventPayload {
  title: string;
  description?: string;
  category: string;
  bannerUrl?: string;
  googlePlaceId: string;
  locationName: string;
  city: string;
  vibe: string;
  organizerAbsorbsServiceFee?: boolean;
  vatPercentage?: 0 | 11 | 21;
  externalTicketUrl?: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  status: "draft" | "scheduled" | "published";
  publishAt?: utcDateTime;
  ticketTypes?: CreateTicketTypePayload[];
  lineup?: ArtistInput[];
}

model UpdateEventPayload {
  id: string;
  title: string;
  description?: string;
  category: string;
  bannerUrl?: string;
  googlePlaceId: string;
  locationName: string;
  city: string;
  vibe: string;
  organizerAbsorbsServiceFee?: boolean;
  vatPercentage?: 0 | 11 | 21;
  externalTicketUrl?: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  status: "draft" | "scheduled" | "published";
  publishAt?: utcDateTime;
  ticketTypes?: UpdateTicketTypePayload[];
  lineup?: ArtistInput[];
}

model CreateInvitationPayload {
  label: string;
  ticketTypeId: string;
  quantity?: int32;
}

model CreatePromoCodePayload {
  code: string;
  discountPercent: int32;
  maxRedemptions?: int32;
  startsAt?: utcDateTime;
  endsAt?: utcDateTime;
}

model PromoCodeResponse {
  id: string;
  code: string;
  discountPercent: int32;
  maxRedemptions?: int32;
  redemptionsCount: int32;
  startsAt?: utcDateTime;
  endsAt?: utcDateTime;
  active: boolean;
  createdAt: utcDateTime;
}

model PromotionPlanResponse {
  id: "one_day" | "thu_sat" | "full_week";
  placement: "home_banner" | "feed";
  name: string;
  description: string;
  amountRon: int32;
  days: int32;
}

model CreatePromotionCheckoutPayload {
  eventId: string;
  plan: "one_day" | "thu_sat" | "full_week";
  placement: "home_banner" | "feed";
  startDate: string;
  billingDetails: PromotionBillingDetailsPayload;
}

model PromotionBillingDetailsPayload {
  registrationNumber?: string;
  address: string;
  city: string;
  county: string;
  sector?: string;
  country: string;
}

model PromotionCheckoutResponse {
  checkoutUrl: string;
  campaignId: string;
}

model PromotionCampaignResponse {
  id: string;
  eventId: string;
  eventTitle: string;
  plan: "one_day" | "thu_sat" | "full_week";
  placement: "home_banner" | "feed";
  status: "pending_payment" | "scheduled" | "active" | "completed" | "cancelled";
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  amountRon: int32;
  impressionsCount: int64;
  clicksCount: int64;
  ctr: decimal;
  createdAt: utcDateTime;
  invoiceStatus?: "pending" | "processing" | "dispatching" | "issued" | "failed" | "needs_review";
  invoiceSeries?: string;
  invoiceNumber?: string;
  invoiceDocumentUrl?: string;
  invoiceIssuedAt?: utcDateTime;
  invoiceRefundStatus?: "none" | "pending" | "partial" | "full" | "failed" | "needs_review";
  invoiceRefundedRon?: float64;
  attentionRequired: boolean;
  attentionReason?: string;
}

model PromotionInvoiceAttentionResponse {
  id: string;
  campaignId: string;
  eventTitle: string;
  organizerId: string;
  customerEmail: string;
  amountRon: float64;
  paymentIntentId?: string;
  invoiceStatus?: string;
  refundStatus?: string;
  refundedAmountRon: float64;
  reason: string;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model PromotedEventResponse {
  campaignId: string;
  placement: "home_banner" | "feed";
  event: EventResponse;
}

model PromotionAvailabilityResponse {
  capacity: int32;
  availableSlots: int32;
}

model TrackPromotionMetricPayload {
  metric: "impression" | "click";
  viewerKey: string;
}

model InvitationTicketResponse {
  id: string;
  label: string;
  validationHash: string;
  ticketType?: string;
  status: "active" | "used" | "revoked";
  createdAt?: utcDateTime;
  batchId: string;
  batchIndex: int32;
}

model SubmitOrganizerProfilePayload {
  cui: string;
  companyName: string;
  organizerAgreementVersion: string;
}

model AcceptOrganizerAgreementPayload {
  version: string;
}

model CreateTicketTypePayload {
  name: string;
  priceRon: int32;
  capacity: int32;
  startSales: utcDateTime;
  endSales: utcDateTime;
  description?: string;
  eventId?: string;
}

model UpdateTicketTypePayload {
  id: string;
  name: string;
  priceRon: int32;
  capacity: int32;
  startSales: utcDateTime;
  endSales: utcDateTime;
  description?: string;
  eventId: string;
}

model UserOrderResponse {
  id: string;
  status: string;
  totalAmountRon: int32;
  paidTotalBani: int64;
  refundedAmountBani: int64;
  stripeRefundStatus: string;
  createdAt: utcDateTime;
  stripePaymentIntentId?: string;
  eventId: string;
  eventTitle: string;
  locationName: string;
  startTime: utcDateTime;
  invoiceRequested: boolean;
  invoiceStatus?: string;
  invoiceSeries?: string;
  invoiceNumber?: string;
  invoiceDocumentUrl?: string;
  invoiceIssuedAt?: utcDateTime;
  refundInvoiceStatus?: string;
  refundInvoiceSeries?: string;
  refundInvoiceNumber?: string;
  refundInvoiceDocumentUrl?: string;
  refundInvoiceIssuedAt?: utcDateTime;
}

model CheckoutTicketItemPayload {
  ticketTypeId: string;
  quantity: int32;
}

model BillingDetailsPayload {
  type: "individual" | "company";
  name: string;
  taxId?: string;
  registrationNumber?: string;
  address: string;
  city: string;
  county: string;
  sector?: string;
  country: string;
}

model CreateCheckoutSessionPayload {
  email: string;
  items: CheckoutTicketItemPayload[];
  promoCode?: string;
  billingDetails: BillingDetailsPayload;
}

model ValidatePromoCodePayload {
  code: string;
}

model PromoCodeValidationResponse {
  code: string;
  discountPercent: int32;
}

model CheckoutSessionResponse {
  checkoutUrl: string;
  orderId: string;
}

model BookFreeTicketPayload {
  items: CheckoutTicketItemPayload[];
}

model BookFreeTicketResponse {
  orderId: string;
  alreadyBooked: boolean;
}

model ReconcileCheckoutPayload {
  sessionId: string;
  eventId: string;
}

model ReconcileCheckoutResponse {
  status: "pending" | "completed" | "failed" | "refunded";
  orderId: string;
}

// --- REQUESTS RESPONSE PAYLOADS ---

model TicketValidationResponse {
	status: "valid" | "already_validated";
	ticketId: string;
	ticketType: string;
	eventTitle: string;
	validatedAt: utcDateTime;
}

model OfflineTicketSnapshot {
  ticketId: string;
  validationHash: string;
  ticketType: string;
}

model OfflineValidationSnapshotResponse {
  snapshotId: string;
  eventId: string;
  eventTitle: string;
  generatedAt: utcDateTime;
  expiresAt: utcDateTime;
  ticketCount: int32;
  tickets: OfflineTicketSnapshot[];
}

model OfflineTicketScanPayload {
  clientScanId: string;
  validationHash: string;
  scannedAt: utcDateTime;
}

model SyncOfflineTicketScansPayload {
  snapshotId: string;
  deviceId: string;
  scans: OfflineTicketScanPayload[];
}

model OfflineTicketSyncResult {
  clientScanId: string;
  status: "accepted" | "already_validated" | "invalid" | "wrong_event";
  ticketId?: string;
  ticketType?: string;
  eventTitle?: string;
  validatedAt?: utcDateTime;
}

model SyncOfflineTicketScansResponse {
  results: OfflineTicketSyncResult[];
}

model ValidationEventResponse {
  id: string;
  title: string;
  startTime: utcDateTime;
  endTime: utcDateTime;
  status: string;
  locationName: string;
  canManage: boolean;
}

model ValidationStaffResponse {
  id: string;
  username: string;
  email: string;
  createdAt: utcDateTime;
}

model AddValidationStaffPayload {
  email: string;
}

model ScannerAccessResponse {
  id: string;
  label: string;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  revokedAt?: utcDateTime;
  createdAt: utcDateTime;
}

model CreateScannerAccessPayload {
  label: string;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
}

model CreateScannerAccessResponse extends ScannerAccessResponse {
  url: string;
}

model CreateScannerSessionPayload {
  token: string;
}

model ScannerSessionResponse {
  sessionToken: string;
  label: string;
  eventTitle: string;
  locationName: string;
  expiresAt: utcDateTime;
}

model OrganizerFinanceEventResponse {
  eventId: string;
  eventTitle: string;
  startTime: utcDateTime;
  grossRevenueRon: int64;
  customerTicketingFeeBani: int64;
  platformFeeBani: int64;
  ticketsSold: int64;
  refundsNeedingAttention: int64;
}

model RefundAttentionResponse {
  orderId: string;
  eventId: string;
  eventTitle: string;
  organizerId: string;
  organizerEmail?: string;
  companyName?: string;
  buyerEmail: string;
  customerTotalBani: int64;
  refundedAmountBani: int64;
  remainingAmountBani: int64;
  platformFeeBani: int64;
  platformFeeStatus: "earned" | "refund_pending" | "refunded" | "needs_review";
  stripeRefundStatus: "none" | "pending" | "partial" | "succeeded" | "failed" | "requires_action";
  refundOrigin: "event_cancellation" | "stripe_dashboard";
  operationStatus: "pending" | "processing" | "stripe_pending" | "succeeded" | "failed" | "needs_review";
  errorMessage?: string;
  ticketCount: int64;
  stripeLivemode: boolean;
  purchasedAt: utcDateTime;
  updatedAt: utcDateTime;
}

model RefundReconciliationResponse {
  requiresAttention: boolean;
  refundStatus: "none" | "pending" | "partial" | "succeeded" | "failed" | "requires_action";
  refundedAmountBani: int64;
  customerTotalBani: int64;
}

model PlatformCommissionInvoiceResponse {
  id: string;
  provider: "oblio" | "smartbill";
  status: "pending" | "processing" | "issued" | "failed" | "needs_review";
  transactionCount: int32;
  totalFeeBani: int64;
  series?: string;
  number?: string;
  documentUrl?: string;
  periodStart: string;
  periodEnd: string;
  issuedAt?: utcDateTime;
  createdAt: utcDateTime;
}

model InvoicingSettingsPayload {
  provider: "oblio" | "smartbill";
  enabled: boolean;
  accountEmail: string;
  apiToken?: string;
  companyVatCode: string;
  seriesName: string;
  vatName: string;
  vatPercentage: float64;
  sendEmail: boolean;
  sendToSpv: boolean;
}

model InvoicingSettingsResponse {
  connected: boolean;
  provider?: "oblio" | "smartbill";
  enabled: boolean;
  accountEmail?: string;
  companyVatCode?: string;
  seriesName?: string;
  vatName?: string;
  vatPercentage: float64;
  sendEmail: boolean;
  sendToSpv: boolean;
  credentialsConfigured: boolean;
}

model InvoicingProviderOptionsPayload {
  provider: "oblio" | "smartbill";
  accountEmail: string;
  apiToken?: string;
  companyVatCode: string;
}

model InvoicingSeriesOption {
  name: string;
  default: boolean;
}

model InvoicingVATRateOption {
  name: string;
  percentage: float64;
  default: boolean;
}

model InvoicingProviderOptionsResponse {
  series: InvoicingSeriesOption[];
  vatRates: InvoicingVATRateOption[];
}

model BillingInvoiceResponse {
  id: string;
  orderId: string;
  provider: "oblio" | "smartbill";
  status: "pending" | "processing" | "issued" | "failed" | "needs_review";
  attemptCount: int32;
  series?: string;
  number?: string;
  documentUrl?: string;
  errorMessage?: string;
  issuedAt?: utcDateTime;
  createdAt: utcDateTime;
  customerName: string;
  customerEmail: string;
  totalAmountRon: int32;
  eventTitle: string;
  refundStatus?: "pending" | "processing" | "issued" | "failed" | "needs_review";
  refundSeries?: string;
  refundNumber?: string;
  refundDocumentUrl?: string;
  refundErrorMessage?: string;
}

// --- ENDPOINTS / RUTE ---

@route("/auth")
interface AuthOperations {
  @summary("Înregistrare utilizator nou")
  @post
  @route("/register")
  register(@body payload: UserRegisterPayload): {
    @statusCode statusCode: 201;
    @body user: User;
  };

  @summary("Autentificare utilizator")
  @post
  @route("/login")
  login(@body payload: UserLoginPayload): {
    @statusCode statusCode: 200;
    token: string;
  };

  @summary("Trimite linkul de resetare a parolei")
  @post
  @route("/forgot-password")
  forgotPassword(@body payload: PasswordResetRequest): MessageResponse;

  @summary("Reseteaza parola folosind tokenul primit pe email")
  @post
  @route("/reset-password")
  resetPassword(@body payload: PasswordResetPayload): MessageResponse;
}

@route("/users")
interface UserOperations {
  @summary("Obține profilul utilizatorului curent")
  @get
  @route("/me")
  getMe(): CurrentUser;

  @summary("Actualizează profilul curent")
  @put
  @route("/me")
  updateMe(
    @body profile: {
      username?: string;
      bio?: string;
      preferredLanguage?: "en" | "ro";
      showAttendancePublicly?: boolean;
    },
  ): CurrentUser;

  @summary("Sterge definitiv contul utilizatorului curent")
  @delete
  @route("/me")
  deleteMe(@body payload: { confirmation: string; currentPassword?: string }): {
    @statusCode statusCode: 204;
  };

  @summary("Obține biletele utilizatorului curent")
  @post
  @route("/me/avatar")
  uploadAvatar(): CurrentUser;

  @get
  @route("/me/tickets")
  getUserTickets(): UserTicketResponse[];

  @get
  @route("/me/orders")
  getUserOrders(): UserOrderResponse[];

  @summary("Obține evenimentele salvate ale utilizatorului curent")
  @get
  @route("/me/saved-events")
  getSavedEvents(): EventResponse[];

  @get
  @route("/me/hidden-categories")
  listHiddenCategories(): string[];

  @post
  @route("/me/hidden-categories")
  hideEventCategory(@body payload: { category: string }): {
    @statusCode statusCode: 204;
  };

  @delete
  @route("/me/hidden-categories/{category}")
  showEventCategory(@path category: string): {
    @statusCode statusCode: 204;
  };

  @get
  @route("/me/billing-details")
  getBillingDetails(): SavedBillingDetailsResponse;

  @put
  @route("/me/billing-details")
  saveBillingDetails(@body payload: BillingDetails): BillingDetails;

  @delete
  @route("/me/billing-details")
  deleteBillingDetails(): {
    @statusCode statusCode: 204;
  };
}

@route("/notifications")
interface NotificationOperations {
  @get
  list(): NotificationListResponse;

  @post
  @route("/read-all")
  markAllRead(): {
    success: boolean;
  };

  @post
  @route("/{id}/read")
  markRead(@path id: string): {
    success: boolean;
  };
}

@route("/profiles")
interface ProfileOperations {
  @get
  @route("/search")
  search(@query q: string): PublicProfileResponse[];

  @get
  @route("/{id}")
  get(@path id: string): PublicProfileResponse;
}

@route("/checkout")
interface CheckoutOperations {
  @summary("Reconciliaza o sesiune Stripe platita cand webhookul Connect intarzie")
  @post
  @route("/reconcile")
  reconcile(@body payload: ReconcileCheckoutPayload): ReconcileCheckoutResponse;
}

@route("/events")
interface EventOperations {
  @summary("Listă completă de evenimente publice (suportă filtrare după categorie, isLive, geolocație pentru hartă și ID specific)")
  @get
  listEvents(
    @maxLength(120) @query q?: string,
    @query category?: string,
    @query city?: string,
    @query vibe?: string,
    @query startsAfter?: utcDateTime,
    @query startsBefore?: utcDateTime,
    @query isLive?: boolean,
    @query latMin?: decimal,
    @query latMax?: decimal,
    @query lonMin?: decimal,
    @query lonMax?: decimal,
    @query organizerId?: string,
    @query page?: int32,
  ): EventResponse[];

  @summary("Salvează un eveniment în favorite")
  @post
  @route("/{id}/favorite")
  saveEvent(@path id: string): {
    @statusCode statusCode: 204;
  };

  @summary("Elimină un eveniment din favorite")
  @delete
  @route("/{id}/favorite")
  removeSavedEvent(@path id: string): {
    @statusCode statusCode: 204;
  };

  @summary("Obține intenția curentă, contoarele sociale și activitatea prietenilor")
  @get
  @route("/{id}/social")
  getSocial(@path id: string): EventSocialResponse;

  @summary("Setează statusul Interested sau Going")
  @put
  @route("/{id}/rsvp")
  setRsvp(@path id: string, @body payload: UpdateEventRsvpPayload): EventSocialResponse;

  @summary("Elimină statusul Interested sau Going")
  @delete
  @route("/{id}/rsvp")
  removeRsvp(@path id: string): EventSocialResponse;

  @get
  @route("/{id}/attendees")
  getAttendees(@path id: string): EventAttendeeResponse[];

  @summary("Obtine grupul privat si starea de siguranta pentru participant")
  @get
  @route("/{id}/safety-group")
  getSafetyGroup(@path id: string): EventSafetyGroupEnvelopeResponse;

  @summary("Creeaza grupul privat al participantului pentru eveniment")
  @post
  @route("/{id}/safety-group")
  createSafetyGroup(
    @path id: string,
    @body payload: CreateEventSafetyGroupPayload,
  ): CreatedResourceResponse;

  @summary("Invita alti prieteni in grupul existent")
  @post
  @route("/{id}/safety-group/invite")
  inviteSafetyGroup(
    @path id: string,
    @body payload: CreateEventSafetyGroupPayload,
  ): SuccessResponse;

  @summary("Accepta sau refuza invitatia in grup")
  @post
  @route("/{id}/safety-group/respond")
  respondSafetyGroup(
    @path id: string,
    @body payload: SafetyGroupInviteResponsePayload,
  ): SuccessResponse;

  @summary("Trimite un mesaj efemer in grup")
  @post
  @route("/{id}/safety-group/messages")
  sendSafetyGroupMessage(
    @path id: string,
    @body payload: SafetyGroupMessagePayload,
  ): CreatedResourceResponse;

  @summary("Trimite o alerta de ajutor prietenilor din grup")
  @post
  @route("/{id}/safety-group/help")
  sendSafetyGroupHelp(
    @path id: string,
    @body payload: SafetyGroupMessagePayload,
  ): CreatedResourceResponse;

  @summary("Anunta grupul ca alerta de ajutor este rezolvata")
  @post
  @route("/{id}/safety-group/help-resolved")
  resolveSafetyGroupHelp(
    @path id: string,
    @body payload: SafetyGroupMessagePayload,
  ): CreatedResourceResponse;

  @summary("Detalii eveniment public după ID (folosește în spate clauza unificată ListEvents din DB)")
  @get
  @route("/{id}")
  getEventByID(@path id: string): EventResponse;

  @summary("Creeaza o sesiune Stripe Checkout pentru biletele selectate")
  @post
  @route("/{id}/tickets/purchase")
  createCheckoutSession(
    @path id: string,
    @body payload: CreateCheckoutSessionPayload,
    @header("Idempotency-Key") idempotencyKey?: string,
  ): {
    @statusCode statusCode: 201;
    @body checkout: CheckoutSessionResponse;
  };

  @summary("Rezerva direct un bilet gratuit pentru utilizatorul autentificat")
  @post
  @route("/{id}/tickets/book")
  bookFreeTicket(
    @path id: string,
    @body payload: BookFreeTicketPayload,
  ): BookFreeTicketResponse;

  @summary("Verifica un cod promo disponibil pentru eveniment")
  @post
  @route("/{id}/promo-code/validate")
  validatePromoCode(
    @path id: string,
    @body payload: ValidatePromoCodePayload,
  ): PromoCodeValidationResponse;

  @summary("Ștergere eveniment")
  @delete
  @route("/{id}")
  deleteEvent(@path id: string): {
    @statusCode statusCode: 204;
  };

  @summary("Check-in la un eveniment live")
  @post
  @route("/{id}/check-in")
  checkIn(@path id: string): {
    @statusCode statusCode: 200;
    success: boolean;
  };

  @summary("Adaugă un comentariu")
  @post
  @route("/{id}/comments")
  addComment(
    @path id: string,
    @body content: {
      content: string;
    },
  ): Comment;

  @summary("Obține comentariile unui eveniment")
  @get
  @route("/{id}/comments")
  getComments(@path id: string, @query page?: int32): Comment[];

  @summary("Obține lista de prieteni acceptați care merg la acest eveniment")
  @get
  @route("/{id}/friends")
  getFriendsGoingToEvent(@path id: string): UserMinResponse[];
}

@route("/friends")
interface FriendOperations {
  @summary("Lista de prieteni acceptați")
  @get
  listFriends(): PublicProfileResponse[];

  @summary("Trimite cerere de prietenie")
  @post
  @route("/request/{userId}")
  sendRequest(@path userId: string): {
    @statusCode statusCode: 201;
  };

  @summary("Acceptă sau refuză o cerere de prietenie")
  @put
  @route("/request/{userId}")
  respondToRequest(
    @path userId: string,
    @body action: {
      status: "accepted" | "declined";
    },
  ): {
    @statusCode statusCode: 200;
  };

  @summary("Elimina un prieten")
  @delete
  @route("/{userId}")
  removeFriend(@path userId: string): {
    @statusCode statusCode: 200;
    relationship: "none";
  };

  @post
  @route("/connect/{userId}")
  connect(@path userId: string): {
    @statusCode statusCode: 200;
    relationship: "friends";
  };

  @summary("Obține cererile de prietenie primite")
  @get
  @route("/requests")
  getFriendRequests(): PublicProfileResponse[];
}

@route("/spotify")
interface SpotifyOperations {
  @get
  @route("/search")
  searchArtists(@query q: string): SpotifyArtistResponse[];
}

@route("/organizers")
interface OrganizerSocialOperations {
  @post
  @route("/{userId}/follow")
  follow(@path userId: string): {
    followsOrganizer: boolean;
  };

  @delete
  @route("/{userId}/follow")
  unfollow(@path userId: string): {
    followsOrganizer: boolean;
  };
}

@route("/organizers")
interface OrganizerUpdatePublicOperations {
  @get
  @route("/{id}/updates")
  listActiveUpdates(@path id: string): OrganizerEventUpdateResponse[];
}

@route("/events")
interface EventUpdatePublicOperations {
  @get
  @route("/{id}/updates")
  listActiveUpdates(@path id: string): OrganizerEventUpdateResponse[];
}

@route("/feed")
interface FeedOperations {
  @get
  list(): SocialFeedItemResponse[];
}

@route("/promotions")
interface PromotionPublicOperations {
  @get
  @route("/active")
  listActive(): PromotedEventResponse[];

  @post
  @route("/{id}/track")
  track(@path id: string, @body payload: TrackPromotionMetricPayload): {
    @statusCode statusCode: 204;
  };
}

@route("/dashboard")
interface DashboardOperations {
  @get
  @route("/promotions/plans")
  listPromotionPlans(): PromotionPlanResponse[];

  @get
  @route("/promotions")
  listPromotionCampaigns(): PromotionCampaignResponse[];

  @get
  @route("/promotions/availability")
  getPromotionAvailability(
    @query plan: "one_day" | "thu_sat" | "full_week",
    @query startDate: string,
  ): PromotionAvailabilityResponse;

  @post
  @route("/promotions/checkout")
  createPromotionCheckout(@body payload: CreatePromotionCheckoutPayload): {
    @statusCode statusCode: 201;
    @body response: PromotionCheckoutResponse;
  };

  @get
  @route("/finance")
  @summary("Situația financiară a evenimentelor organizatorului, bazată pe comenzi finalizate")
  getFinance(): OrganizerFinanceEventResponse[];

  @get
  @route("/finance/refunds-attention")
  @summary("Refundurile parțiale sau neclare care necesită verificare pentru organizator")
  listRefundsRequiringAttention(): RefundAttentionResponse[];

  @post
  @route("/finance/refunds-attention/{id}/reconcile")
  @summary("Reîncarcă statusul refundului direct din Stripe și îl reconciliază")
  reconcileRefundRequiringAttention(@path id: string): RefundReconciliationResponse;

  @get
  @route("/finance/invoices")
  @summary("Facturile lunare emise de SPOTTR pentru comisioanele organizatorului")
  getPlatformCommissionInvoices(): PlatformCommissionInvoiceResponse[];

  @get
  @route("/invoicing/settings")
  getInvoicingSettings(): InvoicingSettingsResponse;

  @post
  @route("/invoicing/options")
  getInvoicingProviderOptions(@body payload: InvoicingProviderOptionsPayload): InvoicingProviderOptionsResponse;

  @put
  @route("/invoicing/settings")
  saveInvoicingSettings(@body payload: InvoicingSettingsPayload): InvoicingSettingsResponse;

  @delete
  @route("/invoicing/settings")
  disconnectInvoicing(): {
    @statusCode statusCode: 204;
  };

  @get
  @route("/invoicing/invoices")
  listBillingInvoices(): BillingInvoiceResponse[];

  @post
  @route("/invoicing/invoices/{id}/retry")
  retryBillingInvoice(@path id: string): {
    @statusCode statusCode: 202;
    status: "pending";
  };

  @post
  @route("/organizer/profile")
  @summary("Trimite datele pentru un profil nou sau existent de organizator (Validare ANAF)")
  submitProfile(@body payload: SubmitOrganizerProfilePayload): OrganizerProfile;

  @get
  @route("/organizer/profile/{id}")
  @summary("Preia profilul privat al organizatorului curent; administratorii pot consulta orice profil")
  getProfile(@path id: string): OrganizerProfile;

  @post
  @route("/organizer/agreement")
  @summary("Inregistreaza acceptarea acordului pentru organizatori")
  acceptOrganizerAgreement(@body payload: AcceptOrganizerAgreementPayload): OrganizerProfile;

  @summary("Creeaza sau reia onboarding-ul Stripe Connect pentru organizatorul curent")
  @post
  @route("/stripe/account-link")
  createStripeAccountLink(): StripeAccountLinkResponse;

  @summary("Actualizeaza starea Stripe Connect a organizatorului curent")
  @get
  @route("/stripe/status")
  getStripeAccountStatus(): OrganizerProfile;

  @summary("Creeaza un link temporar catre Stripe Express Dashboard al organizatorului curent")
  @post
  @route("/stripe/login-link")
  createStripeLoginLink(): StripeAccountLinkResponse;

  @summary("Inchide si deconecteaza contul Stripe Express al organizatorului curent")
  @delete
  @route("/stripe/account")
  disconnectStripeAccount(): {
    @statusCode statusCode: 204;
  };

  @summary("Creare eveniment nou (doar Organizatori/Admini)")
  @post
  @route("/events")
  createEvent(@body event: CreateEventPayload): {
    @statusCode statusCode: 201;
    @body created: EventResponse;
  };

  @get
  @route("/events")
  @summary("Obține lista de evenimente ale organizatorului curent (cu statistici agregate complete)")
  getOrganizerEvents(): EventResponse[];

  @post
  @route("/events/{id}")
  @summary("Editează un eveniment existent (doar Organizatori/Admini)")
  editEvent(@path id: string, @body event: CreateEventPayload): EventResponse;

  @get
  @route("/events/{id}")
  @summary("Obține detaliile administrative complete ale unui singur eveniment din dashboard (GetEventWithStats)")
  getEventWithStats(@path id: string): EventResponse;

  @delete
  @route("/events/{id}")
  @summary("Șterge un eveniment (doar Organizatori/Admini)")
  deleteEvent(@path id: string): {
    @statusCode statusCode: 204;
  };

  @get
  @route("/events/{id}/updates")
  getEventUpdates(@path id: string): OrganizerEventUpdateResponse[];

  @post
  @route("/events/{id}/updates")
  createEventUpdate(
    @path id: string,
    @body payload: CreateOrganizerEventUpdatePayload,
  ): {
    @statusCode statusCode: 201;
    @body response: OrganizerEventUpdateResponse;
  };

  @delete
  @route("/events/{id}/updates/{updateId}")
  deleteEventUpdate(@path id: string, @path updateId: string): {
    @statusCode statusCode: 204;
  };

  @summary("Creare tip de bilet pentru un eveniment")
  @post
  @route("/events/{id}/ticket-types")
  createTicketType(
    @path id: string,
    @body ticketType: CreateTicketTypePayload,
  ): {
    @statusCode statusCode: 201;
    @body response: {
      status: "success";
    };
  };

  @get
  @route("/events/{id}/invitations")
  listInvitations(@path id: string): InvitationTicketResponse[];

  @post
  @route("/events/{id}/invitations")
  createInvitation(@path id: string, @body payload: CreateInvitationPayload): {
    @statusCode statusCode: 201;
    @body response: InvitationTicketResponse[];
  };

  @get
  @route("/events/{id}/cancellation-request")
  getEventCancellationRequest(@path id: string):
    | EventCancellationRequestResponse
    | { @statusCode statusCode: 204 };

  @post
  @route("/events/{id}/cancellation-request")
  createEventCancellationRequest(
    @path id: string,
    @body payload: CreateEventCancellationPayload,
  ): {
    @statusCode statusCode: 201;
    @body response: EventCancellationRequestResponse;
  };

  @delete
  @route("/events/{id}/invitations/{invitationId}")
  revokeInvitation(@path id: string, @path invitationId: string): {
    @statusCode statusCode: 204;
  };

  @delete
  @route("/events/{id}/invitations/{invitationId}/permanent")
  deleteInvitation(@path id: string, @path invitationId: string): {
    @statusCode statusCode: 204;
  };

  @get
  @route("/events/{id}/promo-codes")
  listPromoCodes(@path id: string): PromoCodeResponse[];

  @post
  @route("/events/{id}/promo-codes")
  createPromoCode(@path id: string, @body payload: CreatePromoCodePayload): {
    @statusCode statusCode: 201;
    @body response: { id: string };
  };

  @delete
  @route("/events/{id}/promo-codes/{promoId}")
  deactivatePromoCode(@path id: string, @path promoId: string): {
    @statusCode statusCode: 204;
  };

}

@route("/dashboard/ticket-validation")
interface TicketValidationOperations {
  @get
  @route("/events")
  listValidationEvents(): ValidationEventResponse[];

  @get
  @route("/events/{id}/staff")
  listValidationStaff(@path id: string): ValidationStaffResponse[];

  @post
  @route("/events/{id}/staff")
  addValidationStaff(@path id: string, @body payload: AddValidationStaffPayload): {
    @statusCode statusCode: 204;
  };

  @delete
  @route("/events/{id}/staff/{userId}")
  removeValidationStaff(@path id: string, @path userId: string): {
    @statusCode statusCode: 204;
  };

  @post
  @route("/events/{id}/offline-snapshot")
  createOfflineSnapshot(@path id: string):
    | {
        @statusCode statusCode: 200;
        @body response: OfflineValidationSnapshotResponse;
      }
    | {
        @statusCode statusCode: 400 | 403 | 404 | 500;
        @body response: ApiError;
      };

  @post
  @route("/events/{id}/offline-sync")
  syncOfflineScans(
    @path id: string,
    @body payload: SyncOfflineTicketScansPayload,
  ):
    | {
        @statusCode statusCode: 200;
        @body response: SyncOfflineTicketScansResponse;
      }
    | {
        @statusCode statusCode: 400 | 403 | 404 | 500;
        @body response: ApiError;
      };

  @get
  @route("/events/{id}/quick-access")
  listScannerAccess(@path id: string): ScannerAccessResponse[];

  @post
  @route("/events/{id}/quick-access")
  createScannerAccess(
    @path id: string,
    @body payload: CreateScannerAccessPayload,
  ): {
    @statusCode statusCode: 201;
    @body response: CreateScannerAccessResponse;
  };

  @delete
  @route("/events/{id}/quick-access/{accessId}")
  revokeScannerAccess(@path id: string, @path accessId: string): {
    @statusCode statusCode: 204;
  };

  @post
  @route("/events/{id}/tickets/validate")
  validateTicket(
    @path id: string,
    @body ticket: {
      validationHash: string;
    },
  ):
    | {
        @statusCode statusCode: 200;
        @body response: TicketValidationResponse;
      }
    | {
        @statusCode statusCode: 404;
        @body response: ApiError;
      }
    | {
        @statusCode statusCode: 400;
        @body response: ApiError;
      }
    | {
        @statusCode statusCode: 500;
        @body response: ApiError;
      };
}

@route("/admin")
interface AdminOperations {
  @get
  @route("/organizers")
  listOrganizerVerifications(): OrganizerVerificationRequest[];

  @patch
  @route("/organizers/{id}/verification")
  reviewOrganizerVerification(
    @path id: string,
    @body payload: ReviewOrganizerVerificationPayload,
  ): OrganizerProfile;

  @get
  @route("/event-cancellations")
  listEventCancellationRequests(): EventCancellationRequestResponse[];

  @post
  @route("/event-cancellations/{id}/approve")
  approveEventCancellation(
    @path id: string,
    @body payload: ReviewEventCancellationPayload,
  ): {
    @statusCode statusCode: 202;
    @body response: { status: "refunding" };
  };

  @post
  @route("/event-cancellations/{id}/reject")
  rejectEventCancellation(
    @path id: string,
    @body payload: ReviewEventCancellationPayload,
  ): { @statusCode statusCode: 204 };

  @post
  @route("/event-cancellations/{id}/retry")
  retryEventCancellation(@path id: string): {
    @statusCode statusCode: 202;
    @body response: { status: "refunding" };
  };

  @get
  @route("/refunds-attention")
  listRefundsRequiringAttention(): RefundAttentionResponse[];

  @post
  @route("/refunds-attention/{id}/reconcile")
  reconcileRefundRequiringAttention(@path id: string): RefundReconciliationResponse;

  @get
  @route("/promotion-invoices-attention")
  listPromotionInvoicesRequiringAttention(): PromotionInvoiceAttentionResponse[];
}

@route("/ticket-validation/quick-access")
interface QuickScannerOperations {
  @post
  @route("/session")
  createScannerSession(@body payload: CreateScannerSessionPayload): ScannerSessionResponse;

  @post
  @route("/validate")
  validateTicket(
    @body ticket: {
      validationHash: string;
    },
  ):
    | {
        @statusCode statusCode: 200;
        @body response: TicketValidationResponse;
      }
    | {
        @statusCode statusCode: 404;
        @body response: ApiError;
      }
    | {
        @statusCode statusCode: 400;
        @body response: ApiError;
      }
    | {
        @statusCode statusCode: 500;
        @body response: ApiError;
      };
}
