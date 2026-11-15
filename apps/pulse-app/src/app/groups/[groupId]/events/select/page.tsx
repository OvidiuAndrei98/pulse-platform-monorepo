import GroupEventPickerPage from '@/features/groups/GroupEventPickerPage';
export default async function Page({params,searchParams}:{params:Promise<{groupId:string}>;searchParams:Promise<{planId?:string;from?:string;returnFrom?:string}>}){const {groupId}=await params,query=await searchParams;return <GroupEventPickerPage groupId={groupId} {...query}/>}
