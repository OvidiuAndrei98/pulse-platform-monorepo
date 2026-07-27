export const eventCategories = [
  "TECHNO",
  "HOUSE",
  "TRANCE",
  "HARDSTYLE",
  "DRUM & BASS",
  "HIP-HOP",
  "POP",
  "ROCK",
  "INDIE",
  "JAZZ",
  "PARTY",
  "FESTIVAL",
  "CONCERT",
  "EXPO",
  "OTHER",
] as const;

export const allEvents = [
  {
    id: "1",
    title: "Techno Night",
    category: "TECHNO",
    startTime: new Date("2024-06-15T22:00:00"),
    endTime: new Date("2024-06-16T04:00:00"),
    locationName: "Club Glow",
    bannerUrl: "/images/events/techno-night.jpg",
    isLive: true,
  },
];
