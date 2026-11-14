import GroupConversation from '@/features/groups/GroupConversation';
export default async function Page({params}:{params:Promise<{groupId:string}>}){const {groupId}=await params;return <GroupConversation groupId={groupId}/>}
