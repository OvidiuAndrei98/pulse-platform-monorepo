import GroupOuting from '@/features/groups/GroupOuting';
export default async function Page({params}:{params:Promise<{groupId:string;planId:string}>}){const {groupId,planId}=await params;return <GroupOuting groupId={groupId} planId={planId}/>}
