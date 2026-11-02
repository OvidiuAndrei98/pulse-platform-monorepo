import { Suspense } from 'react';
import EventNightPage from '@/features/outings/EventNightPage';
export function generateStaticParams(){return [{id:'mobile'}];}
export default function Page(){return <Suspense><EventNightPage/></Suspense>;}
