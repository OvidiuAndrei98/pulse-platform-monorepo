/** Stable order shared by web routing, native stacks and both icon renderers. */
export const MAIN_TAB_DEFINITIONS = [
  { id: 'home', name: 'Home', path: '/', label: 'nav.home' },
  { id: 'map', name: 'Explore', path: '/events', label: 'nav.map' },
  { id: 'friends', name: 'Friends', path: '/friends', label: 'nav.friends' },
  { id: 'feed', name: 'Feed', path: '/feed', label: 'nav.feed' },
  { id: 'profile', name: 'Profile', path: '/users/me', label: 'nav.profile' },
] as const;
export const MAIN_TAB_NAMES = MAIN_TAB_DEFINITIONS.map(tab => tab.name);
export const MAIN_TAB_LABELS = MAIN_TAB_DEFINITIONS.map(tab => tab.label);
export const PROFILE_TAB_INDEX = MAIN_TAB_DEFINITIONS.findIndex(tab => tab.name === 'Profile');
