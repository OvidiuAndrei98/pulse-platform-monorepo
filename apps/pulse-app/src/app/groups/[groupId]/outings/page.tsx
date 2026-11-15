import {GroupContentList} from '@/features/groups/GroupManagement';
export default async function Page({params,searchParams}:{params:Promise<{groupId:string}>;searchParams:Promise<{from?:string}>}){const {groupId}=await params,{from}=await searchParams;return <GroupContentList groupId={groupId} kind="outings" from={from}/>}
