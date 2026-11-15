import GroupNightPage from '@/features/groups/GroupNightPage';
export default async function Page({params,searchParams}:{params:Promise<{groupId:string}>;searchParams:Promise<{from?:string}>}){const {groupId}=await params,{from}=await searchParams;return <GroupNightPage groupId={groupId} from={from}/>}
