import "@typespec/http";
using TypeSpec.Http;
namespace Pulse;
model FriendGroupMember {userId:string;username:string;avatarUrl?:string;status:"pending"|"accepted";}
model FriendGroup {id:string;name:string;ownerId:string;status:"pending"|"accepted";revision:int64;lastSeq:int64;visibleAfterSeq:int64;joinedAt?:utcDateTime;activityAt?:utcDateTime;unread:int32;muted:boolean;preview:string;previewKind?:"text"|"event"|"outing";previewAuthor?:string;previewDate?:string;members:FriendGroupMember[];outings:OutingPlan[];outingsHasMore:boolean;}
model GroupOutingsPage {items:OutingPlan[];hasMore:boolean;}
model SharedGroupEvent {id:string;title:string;imageUrl:string;location:string;city:string;startTime:utcDateTime;endTime:utcDateTime;status:string;}
model GroupOutingMessageContext {decisionRound:int32;title:string;city:string;outingDate?:string;candidateDates:string[];chosenEventId?:string;}
model FriendGroupMessage {id:string;requestId:string;seq:int64;senderId:string;username:string;avatarUrl?:string;kind:"text"|"event"|"outing";content:string;eventId?:string;outingId?:string;createdAt:utcDateTime;event?:SharedGroupEvent;outingContext?:GroupOutingMessageContext;}
model GroupMessages {items:FriendGroupMessage[];hasMore:boolean;revision:int64;}
model CreateFriendGroup {requestId:string;name:string;friendIds:string[];eventId?:string;}
model FriendGroupAction {action:"accept"|"decline"|"rename"|"invite"|"transfer-admin"|"leave"|"remove"|"mute"|"read";userId?:string;name?:string;muted?:boolean;seq?:int64;}
model SendGroupMessage {requestId:string;content:string;eventId?:string;}
model CreateGroupOuting {requestId:string;title?:string;city?:string;date?:string;dates?:string[];eventId?:string;}
model OutingAttendance {answer:OutingAnswer;decisionRound:int32;}
model UpdateOutingContext {revision:int64;city:string;date?:string;dates?:string[];title?:string;confirmImpact?:boolean;}
model OutingContextImpact {availabilityResponses:int32;eventPreferences:int32;attendanceResponses:int32;proposalsKept:int32;proposalsIncompatible:int32;destinationCleared:boolean;ticketsUnaffected:boolean;}
@error model OutingContextError {@statusCode statusCode:400|401|403|404|409|422|500;error:string;existingPlanId?:string;impact?:OutingContextImpact;}
@route("/outings") interface FriendGroups {
 @get @route("/groups") groups():FriendGroup[];
 @post @route("/groups") create(@body body:CreateFriendGroup):FriendGroup;
 @get @route("/groups/{groupID}") group(@path groupID:string):FriendGroup;
 @post @route("/groups/{groupID}/actions") action(@path groupID:string,@body body:FriendGroupAction):OutingMutationResult;
 @get @route("/groups/{groupID}/messages") messages(@path groupID:string,@query before?:int64,@query collection?:"events"):GroupMessages;
 @post @route("/groups/{groupID}/messages") send(@path groupID:string,@body body:SendGroupMessage):OutingMutationResult;
 @post @route("/groups/{groupID}/outings") outing(@path groupID:string,@body body:CreateGroupOuting):OutingPlan;
 @get @route("/groups/{groupID}/outings") history(@path groupID:string,@query before?:string):GroupOutingsPage;
 @post @route("/plans/{planID}/attendance") attendance(@path planID:string,@body body:OutingAttendance):OutingMutationResult;
 @post @route("/plans/{planID}/context") updateContext(@path planID:string,@body body:UpdateOutingContext):OutingPlan|OutingContextError;
}
