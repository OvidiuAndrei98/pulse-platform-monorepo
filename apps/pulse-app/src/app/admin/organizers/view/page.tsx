"use client";
import { Suspense } from 'react';
import { OrganizerView } from '../DirectoryPanel';
export default function Page() { return <Suspense fallback={<p role="status">…</p>}><OrganizerView /></Suspense>; }
