import GroupInfo from '@/features/groups/GroupManagement';
export default async function Page({params}:{params:Promise<{groupId:string}>}){const {groupId}=await params;return <GroupInfo groupId={groupId}/>}
