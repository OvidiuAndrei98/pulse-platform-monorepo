"use client";
import {useTranslation} from 'react-i18next';
import type {FeedGroup} from '@packages/app-core/social/feedTypes';
import {EventPreview} from '@/features/groups/EventPreview';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import s from './friends.module.css';

/** Only the authorized public social feed is used here, never a private group roster. */
export function FriendsEvent({item}:{item:FeedGroup}){
 const {t}=useTranslation();
 return <article className={s.friendEvent} data-testid={'friends-event-'+item.eventId}>
  <EventPreview title={item.eventTitle} startTime={item.eventStartTime} imageUrl={item.eventBannerUrl} location={item.eventLocation} city={item.eventCity} href={'/events/'+item.eventId}>
   <span className={s.friendContext}><span className={s.friendAvatars} aria-hidden>{item.actors.slice(0,2).map(actor=><MemberAvatar key={actor.actorId} name={actor.actorUsername} uri={actor.actorAvatarUrl} userId={actor.actorId}/>)}</span><span>{[item.ticketActors.length?t('groups.friendsWithTickets',{count:item.ticketActors.length}):'',item.goingActors.length?t('groups.friendsGoing',{count:item.goingActors.length}):''].filter(Boolean).join(' · ')}</span></span>
  </EventPreview>
 </article>;
}
