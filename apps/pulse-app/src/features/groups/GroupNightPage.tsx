"use client";
import {useRouter} from 'next/navigation';
import {useTranslation} from 'react-i18next';
import {GroupPageFrame,groupPath,pickerPath} from './GroupManagement';
import {ProposeNight} from './GroupDialogs';
import {clearNightDraft,nightDraft,saveNightDraft} from './nightDraft';
import {useGroups} from './useGroups';
export default function GroupNightPage({groupId,from='chat'}:{groupId:string;from?:string}){
 const model=useGroups(groupId),router=useRouter(),{t}=useTranslation(),root=groupPath(groupId),back=from==='outings'?root+'/outings':root;
 const clear=()=>clearNightDraft(model.store,groupId);
 return <GroupPageFrame hideHeader model={model} groupId={groupId} title={t('groups.propose')} back={back} testId="group-new-night-page">{group=><ProposeNight group={group} model={model} initialDraft={nightDraft(model.store,groupId)} onDraft={draft=>saveNightDraft(model.store,groupId,draft)} onFinish={clear} onClose={()=>{clear();router.replace(back)}} onChooseEvent={()=>router.push(pickerPath(groupId,'night')+'&returnFrom='+encodeURIComponent(from))}/>}</GroupPageFrame>;
}
