import { Coordinates, EventFilters } from "@/features/events/types";

export const eventCities = [
  "Bucuresti",
  "Cluj-Napoca",
  "Timisoara",
  "Iasi",
  "Brasov",
  "Constanta",
  "Sibiu",
];

export const eventVibes = [
  "Chill",
  "Energetic",
  "Underground",
  "Mainstream",
  "Outdoor",
  "Indoor",
];

export const cityCenters: Record<string, Coordinates> = {
  Bucuresti: [44.4268, 26.1025],
  "Cluj-Napoca": [46.7712, 23.6236],
  Timisoara: [45.7489, 21.2087],
  Iasi: [47.1585, 27.6014],
  Brasov: [45.6579, 25.6012],
  Constanta: [44.1598, 28.6348],
  Sibiu: [45.7983, 24.1256],
};

export const defaultEventFilters: EventFilters = {
  categories: [],
  vibes: [],
  date: "Tonight",
  distance: 15,
  city: "",
};
