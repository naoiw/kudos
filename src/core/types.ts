export interface Activity {
  user_id?: string;
  run_id: number;
  name: string;
  distance: number; // meters
  moving_time: string; // "H:MM:SS"
  type: 'Run' | 'Ride' | string;
  subtype?: string;
  start_date: string;
  start_date_local: string;
  location_country: string | null;
  summary_polyline: string | null;
  route_segments?: string[]; // Disjoint GPX/TCX segments; encoded polyline precision 5.
  average_heartrate: number | null;
  average_speed: number; // m/s
  elevation_gain: number | null;
  source: string;
  streak: number;
}

export type SportFilter = 'all' | 'Run' | 'Ride';
