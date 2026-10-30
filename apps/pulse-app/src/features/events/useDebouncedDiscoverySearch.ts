import { useEffect, useState } from 'react';
import { normalizeDiscoverySearch } from './discoveryFilters';
export function useDebouncedDiscoverySearch(value='') {
  const normalized=normalizeDiscoverySearch(value),[query,setQuery]=useState(normalized);
  useEffect(()=>{if(!normalized){setQuery('');return;}const timer=setTimeout(()=>setQuery(normalized),300);return()=>clearTimeout(timer);},[normalized]);
  return query;
}
