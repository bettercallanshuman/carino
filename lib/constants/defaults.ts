import type { Banner, UserProfile } from '@/types';

export const DEFAULT_BANNERS: Banner[] = [
  {
    id: 1,
    title: 'R&B Hits',
    subtitle: 'Hot Shot, Confessions, Beyonce, Usher, The-Dream, Mario, Akif, Princeton Michael...',
    category: 'CURATED PLAYLIST',
    stats: '50,056 Likes • 213 Songs, 13 hr 7 min',
    gradient: 'linear-gradient(135deg, #FF5722 0%, #E64A19 100%)',
  },
  {
    id: 2,
    title: 'Late Night Drive',
    subtitle: 'Mellow beats, midnight synthesizers and contemplative vocals for long roads.',
    category: 'CURATED MIX',
    stats: '34,210 Likes • 140 Songs, 8 hr 12 min',
    gradient: 'linear-gradient(135deg, #4338CA 0%, #312E81 100%)',
  },
  {
    id: 3,
    title: 'Lo-Fi Distance',
    subtitle: 'Together, apart. Gentle chords, tape warbles and quiet companionship.',
    category: 'PRIVATE SESSION',
    stats: '28,840 Likes • 98 Songs, 5 hr 45 min',
    gradient: 'linear-gradient(135deg, #0D9488 0%, #115E59 100%)',
  },
  {
    id: 4,
    title: 'Soul & Horizons',
    subtitle: 'Warm vintage soul, golden hour grooves and memories across time zones.',
    category: 'EXCLUSIVE SELECTION',
    stats: '41,920 Likes • 165 Songs, 10 hr 20 min',
    gradient: 'linear-gradient(135deg, #BE185D 0%, #881337 100%)',
  },
];

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Anshuman',
  avatar_url: null,
  gender: 'Prefer not to say',
  date_of_birth: '2000-01-01',
};
