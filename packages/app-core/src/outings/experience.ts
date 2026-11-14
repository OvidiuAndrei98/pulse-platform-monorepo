import {planningToday,type OutingPlan} from './model';

export function planNextAction(plan:OutingPlan,actor?:string) {
 if(plan.status==='pending')return 'invited';
 if(plan.chosenEventId)return 'confirmed';
 const owner=plan.ownerId===actor;
 if(plan.outingDate)return owner?'chooseDestination':'yourPreference';
 const dates=plan.candidateDates??[];
 const answered=dates.length>0&&dates.every(day=>day.responses.some(r=>r.userId===actor));
 return owner?'chooseNight':answered?'waiting':'yourNights';
}
export function eligiblePlanRecipients(plan:OutingPlan) {
 // Membership determines the roster. Attendance and ownership are independent:
 // a member who declines or already owns admission may receive an explicit extra.
 return plan.members.filter(member=>member.status==='accepted');
}
export function recipientHasPendingAccess(member:OutingPlan['members'][number]) {
 return member.ticketState==='offered'||member.ticketState==='processing';
}
export function automaticPlanRecipients(plan:OutingPlan) {
 return eligiblePlanRecipients(plan).filter(member=>member.attendance==='yes'&&member.ticketState==='none'&&member.hasTicket===false);
}
export function relevantOutingPlans(plans:readonly OutingPlan[],now=Date.now()) {
 const date=(p:OutingPlan)=>p.outingDate??p.candidateDates?.[0]?.date;
 const day=planningToday(new Date(now));
 const past=(p:OutingPlan)=>!!date(p)&&date(p)! < day;
 return [...plans].sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending')||Number(past(a))-Number(past(b))||(date(a)??'9999').localeCompare(date(b)??'9999'));
}
export const outingExperienceCopy={
 en:{
  planWithFriends:'Plan with friends',proposeShort:'Propose',knownNoTicket:'No ticket for this event',limitedSeats:'Not enough tickets for this selection. Choose fewer people or another ticket type.',
  responseDetails:'Friends’ answers',notAnswered:'Not answered yet',proposalLimit:'All 8 proposal places are in use.',
  giftWindowClosed:'Tickets for friends are unavailable once entry codes are prepared or the event starts. You can still get your own ticket.',
  offlineTransferClosed:'This entry code has already been prepared for the scanner. It can no longer be transferred; the ticket stays in the buyer’s account.',
  eventTransferClosed:'The event has started, so this ticket can no longer be transferred. It stays in the buyer’s account.',
  cancelled:'This event has been cancelled.',orders:'View my order',continueOne:'Continue · 1 ticket',
  ticketOptions:'Tickets & destination',checkingPayment:'Check your payment',unavailable:'Tickets are not available right now.',invitationConfirmed:'Join the plan to see your friends and get your tickets. Accepting does not make a purchase.',
  giftFrom:'{{name}} got you a ticket for {{event}}.',
  tickets:'Get tickets',
  self:'Your ticket',processing:'Payment is being checked',pendingTicket:'Sent to {{name}} · awaiting acceptance',acceptedTicket:'Received by {{name}}',returnedTicket:'{{name}} · ticket stays with you',
  invited:'{{name}} invited you',confirmed:'Your night, together.',chooseDestination:'Mark your favourites. As creator, you choose the destination.',yourPreference:'Choose every event you would go to.',chooseNight:'See who can make it, then choose the night.',yourNights:'Tell your friends when you can go.',waiting:'Your answers are saved. Waiting for the creator’s choice.',
  people:'Who’s coming',pending:'{{count}} invited · awaiting a reply',more:'Plan options',choose:'Choose the destination',chooseNightAction:'Choose the night',review:'Review choice',confirm:'Confirm destination',missing:'Some friends have not confirmed this option. You can still confirm; their answers stay unchanged.',proposedBy:'Proposed by {{name}}',responses:'{{yes}} would go · {{maybe}} also works',noProposals:'Where should the night take you?',noProposalsHint:'Add an event for this night. Your friends can suggest one too.',
  known:'We know the night',together:'Choose together',optional:'Optional',invite:'Invite to this event',inviteHint:'The destination is confirmed. Your friends decide whether to join; nothing is reserved or charged.',deadlineOptional:'Add a response deadline',noDeadline:'No response deadline',
  recipients:'Who are the tickets for?',recipientsHint:'One ticket per person. Friends accept their tickets in Spottr after payment.',unknown:'Ticket status not shared',needs:'Asked for a ticket',selectNeeds:'Select friends who need tickets',continue:'Continue · {{count}} tickets',friendsTickets:'Get tickets for friends',ticketStatus:'Share my ticket status',needTicket:'I need a ticket',privateTicket:'Your ticket information stays private unless you choose to share it.',incoming:'A friend sent you a ticket',acceptTicket:'Accept your ticket',transferHint:'Declining a ticket does not refund the purchase. The buyer keeps it until you accept.',reviewRecipients:'Tickets for',recipientChanged:'This selection is no longer available. Review the recipients or your existing payment before trying again.',
  about:'About this night',previous:'Earlier destination',outcome:'The plan does not reserve or buy tickets.',all:'See all',saving:'Saving…',noPhotos:'Event image unavailable',
 },
 ro:{
  planWithFriends:'Planifică cu prietenii',proposeShort:'Propune',knownNoTicket:'Fără bilet pentru acest eveniment',limitedSeats:'Nu mai sunt suficiente bilete pentru această selecție. Alege mai puține persoane sau alt tip de bilet.',
  responseDetails:'Răspunsurile prietenilor',notAnswered:'Încă nu a răspuns',proposalLimit:'Toate cele 8 locuri pentru propuneri sunt ocupate.',
  giftWindowClosed:'Biletele pentru prieteni nu mai sunt disponibile după pregătirea codurilor de acces sau începerea evenimentului. Îți poți lua în continuare propriul bilet.',
  offlineTransferClosed:'Acest cod de acces a fost deja pregătit pentru scanare. Biletul nu mai poate fi transferat și rămâne în contul cumpărătorului.',
  eventTransferClosed:'Evenimentul a început, așa că biletul nu mai poate fi transferat. Rămâne în contul cumpărătorului.',
  cancelled:'Acest eveniment a fost anulat.',orders:'Vezi comanda mea',continueOne:'Continuă · 1 bilet',
  ticketOptions:'Bilete și destinație',checkingPayment:'Verifică plata',unavailable:'Biletele nu sunt disponibile acum.',invitationConfirmed:'Intră în plan ca să vezi prietenii și să ajungi la bilete. Acceptarea nu înseamnă cumpărare.',
  giftFrom:'{{name}} ți-a luat un bilet la {{event}}.',
  tickets:'Ia bilete',
  self:'Biletul tău',processing:'Verificăm plata',pendingTicket:'Trimis către {{name}} · așteaptă acceptarea',acceptedTicket:'Primit de {{name}}',returnedTicket:'{{name}} · biletul rămâne la tine',
  invited:'{{name}} te-a invitat',confirmed:'Seara voastră, împreună.',chooseDestination:'Alege-ți favoritele. Ca inițiator, tu confirmi destinația.',yourPreference:'Alege toate evenimentele la care ai merge.',chooseNight:'Vezi cine poate veni, apoi alege seara.',yourNights:'Spune-le prietenilor când poți ieși.',waiting:'Răspunsurile tale sunt salvate. Așteptăm alegerea creatorului.',
  people:'Cu cine ieși',pending:'{{count}} invitați · așteptăm răspunsul',more:'Opțiunile planului',choose:'Alege destinația',chooseNightAction:'Alege seara',review:'Verifică alegerea',confirm:'Confirmă destinația',missing:'Unii prieteni nu au răspuns sau nu pot veni. Poți confirma; răspunsurile lor rămân neschimbate.',proposedBy:'Propus de {{name}}',responses:'{{yes}} ar merge · {{maybe}} acceptă și varianta',noProposals:'Unde vă poartă seara?',noProposalsHint:'Propune un eveniment pentru această seară. Și prietenii pot adăuga variante.',
  known:'Știm seara',together:'Alegem împreună',optional:'Opțional',invite:'Invită la acest eveniment',inviteHint:'Destinația este confirmată. Prietenii aleg dacă vin; nu se rezervă și nu se plătește nimic.',deadlineOptional:'Adaugă un termen pentru răspunsuri',noDeadline:'Fără termen de răspuns',
  recipients:'Pentru cine sunt biletele?',recipientsHint:'Un bilet de persoană. Prietenii acceptă biletele în Spottr după plată.',unknown:'Situația biletului este privată',needs:'A cerut un bilet',selectNeeds:'Selectează prietenii care au nevoie',continue:'Continuă · {{count}} bilete',friendsTickets:'Ia bilete pentru prieteni',ticketStatus:'Partajează situația biletului meu',needTicket:'Am nevoie de un bilet',privateTicket:'Situația biletului rămâne privată dacă nu alegi să o partajezi.',incoming:'Un prieten ți-a trimis un bilet',acceptTicket:'Acceptă biletul',transferHint:'Refuzul nu rambursează achiziția. Biletul rămâne la cumpărător până îl accepți.',reviewRecipients:'Bilete pentru',recipientChanged:'Selecția nu mai este disponibilă. Verifică destinatarii sau plata existentă înainte să reîncerci.',
  about:'Despre seara asta',previous:'Destinația anterioară',outcome:'Planul nu rezervă și nu cumpără bilete.',all:'Vezi toate',saving:'Se salvează…',noPhotos:'Fotografia nu este disponibilă',
 }
};
