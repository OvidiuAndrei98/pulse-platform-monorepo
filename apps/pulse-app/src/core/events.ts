import partyImage from "../../public/party-event.jpg";

export type EventDate = "Tonight" | "Tomorrow" | "This weekend" | "Next week";

export type EventCategory =
  | "Rave"
  | "House"
  | "Techno"
  | "Disco"
  | "Festival"
  | "Rooftop"
  | "Warehouse";

export type EventVibe =
  | "Chill"
  | "Energetic"
  | "Underground"
  | "Mainstream"
  | "Outdoor"
  | "Indoor";

export type Event = {
  id: string;
  title: string;
  category: EventCategory;
  vibe: EventVibe;
  date: EventDate;
  time: string;
  location: string;
  distance: number;
  image: string;
  organizer: string;
  isLive: boolean;
};

export type Organizer = {
  id: string;
  name: string;
  events: number;
};

export const categories: EventCategory[] = [
  "Rave",
  "House",
  "Techno",
  "Disco",
  "Festival",
  "Rooftop",
  "Warehouse",
];

export const vibes: EventVibe[] = [
  "Chill",
  "Energetic",
  "Underground",
  "Mainstream",
  "Outdoor",
  "Indoor",
];

export const dates: EventDate[] = [
  "Tonight",
  "Tomorrow",
  "This weekend",
  "Next week",
];

export const allEvents: Event[] = [
  {
    id: "e1",
    title: "Neon Warehouse",
    category: "Warehouse",
    vibe: "Energetic",
    date: "Tonight",
    time: "Ends 4 AM",
    location: "Docks 7",
    distance: 3,
    image: partyImage.src,
    organizer: "Bucharest Rave Collective",
    isLive: true,
  },
  {
    id: "e2",
    title: "Sunset Rooftop",
    category: "Rooftop",
    vibe: "Chill",
    date: "Tonight",
    time: "Ends 2 AM",
    location: "Skybar",
    distance: 5,
    image: partyImage.src,
    organizer: "Sunset Sessions",
    isLive: true,
  },
  {
    id: "e3",
    title: "Basement Beats",
    category: "Techno",
    vibe: "Underground",
    date: "Tonight",
    time: "Ends 5 AM",
    location: "Club 23",
    distance: 2,
    image: partyImage.src,
    organizer: "Underground Bucharest",
    isLive: true,
  },
  {
    id: "e4",
    title: "Michael and Anthonia Party",
    category: "Rave",
    vibe: "Energetic",
    date: "Tomorrow",
    time: "12 Sep · 10 PM",
    location: "Shiho B1056",
    distance: 8,
    image: partyImage.src,
    organizer: "Shiho Crew",
    isLive: false,
  },
  {
    id: "e5",
    title: "Summer Fest",
    category: "Festival",
    vibe: "Outdoor",
    date: "This weekend",
    time: "18 Sep · 6 PM",
    location: "Central Park",
    distance: 12,
    image: partyImage.src,
    organizer: "Festival Nation",
    isLive: false,
  },
  {
    id: "e6",
    title: "Retro Disco Night",
    category: "Disco",
    vibe: "Mainstream",
    date: "Next week",
    time: "22 Sep · 9 PM",
    location: "Loft 12",
    distance: 4,
    image: partyImage.src,
    organizer: "Disco Fever",
    isLive: false,
  },
  {
    id: "e7",
    title: "House at the Manor",
    category: "House",
    vibe: "Chill",
    date: "This weekend",
    time: "19 Sep · 8 PM",
    location: "Manor Club",
    distance: 6,
    image: partyImage.src,
    organizer: "Deep House Romania",
    isLive: false,
  },
  {
    id: "e8",
    title: "Techno Tunnel",
    category: "Techno",
    vibe: "Underground",
    date: "Tomorrow",
    time: "13 Sep · 11 PM",
    location: "The Tunnel",
    distance: 7,
    image: partyImage.src,
    organizer: "Underground Bucharest",
    isLive: false,
  },
];

export const organizers: Organizer[] = [
  { id: "o1", name: "Bucharest Rave Collective", events: 12 },
  { id: "o2", name: "Sunset Sessions", events: 8 },
  { id: "o3", name: "Underground Bucharest", events: 15 },
  { id: "o4", name: "Shiho Crew", events: 4 },
  { id: "o5", name: "Festival Nation", events: 22 },
  { id: "o6", name: "Disco Fever", events: 6 },
  { id: "o7", name: "Deep House Romania", events: 9 },
];
