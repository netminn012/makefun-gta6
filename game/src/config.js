// config.js — every shared fact about Solmar City and the game built on it: the road grid the
// traffic follows, the island shapes the physics clamps to, the named places the story uses, the
// car and pedestrian palettes, and the mission chain. Other modules import these constants
// instead of hard-coding their own, so the world the renderer draws is the world the AI drives.

/** The whole map: the main island, the causeway and the north island, in metres. */
export const WORLD = {
  islandHalfX: 470, // main island spans x in [-470, 470]
  islandHalfZ: 330, // main island spans z in [-330, 330]
  waterY: -1.2, // ocean surface height; island ground is y = 0
  beachZ: 272, // sand starts here and runs to the south shore
};

/** East-west avenues (constant x) and north-south streets (constant z) of the city grid. */
export const AVENUES_X = [-400, -300, -200, -100, 0, 100, 200, 300, 400];
export const STREETS_Z = [-260, -170, -80, 10, 100, 190];
export const BOULEVARD_Z = 255; // the beachfront boulevard, wider than a street
export const ROAD_HALF = { avenue: 8, street: 7, boulevard: 12 };

/** The causeway: a two-lane bridge from the north shore to the lighthouse island. */
export const CAUSEWAY = { x: 200, zStart: -330, zEnd: -636, deckY: 2.6, halfWidth: 8 };
/** The north island at the end of the causeway: x in [60, 240], z in [-800, -630]. */
export const NORTH = { minX: 60, maxX: 240, minZ: -800, maxZ: -630 };

/** Named places the missions and respawns use. x/z are on the ground; heading is radians. */
export const PLACES = {
  playerStart: { x: -128, z: 274, heading: Math.PI }, // on the beach sidewalk, facing the hotels
  coupeStart: { x: -112, z: 245.5, heading: Math.PI / 2 }, // the player's turquoise coupe at the curb
  club: { x: 60, z: 226, name: 'Club Azul' }, // beach club on the boulevard (mission target)
  hotel: { x: -170, z: 226, name: 'Hotel Azahar' }, // delivery target on the boulevard
  docks: { x: -428, z: 128, name: 'the West Docks' }, // warehouse at the island's west end
  station: { x: 112, z: -104, name: 'Marina Police Station' }, // busted respawn
  hospital: { x: -288, z: 34, name: 'Solmar Clinic' }, // wasted respawn
  hideout: { x: 96, z: -672, name: 'the Lighthouse Garage' }, // finale: lose the heat here
  lighthouse: { x: 200, z: -762, name: 'Solmar Light' },
};

/** Car paint jobs the city drives in: hex colour and the name the HUD shows. */
export const CAR_COLORS = [
  { hex: 0xd94f30, name: 'Sunset Orange' },
  { hex: 0x2ea8a0, name: 'Lagoon Turquoise' },
  { hex: 0xf2c230, name: 'Taxi Yellow' },
  { hex: 0xe8e4da, name: 'Pearl White' },
  { hex: 0x35507a, name: 'Harbour Blue' },
  { hex: 0x7a2e4d, name: 'Orchid Wine' },
  { hex: 0x3f9e4d, name: 'Palm Green' },
  { hex: 0x22242a, name: 'Midnight Black' },
  { hex: 0xc0c6cc, name: 'Silver Mist' },
  { hex: 0xff7fa5, name: 'Flamingo Pink' },
];

/** The drivable kinds: fictional model names, sizes and how fast they go. */
export const CAR_KINDS = {
  coupe: { name: 'Vireo Solstice Coupe', length: 4.3, width: 1.9, topSpeed: 38, accel: 15 },
  sedan: { name: 'Marlin Sedan', length: 4.7, width: 1.95, topSpeed: 32, accel: 12 },
  taxi: { name: 'Solmar Cab', length: 4.7, width: 1.95, topSpeed: 32, accel: 12 },
  pickup: { name: 'Dune Runner Pickup', length: 5.0, width: 2.05, topSpeed: 30, accel: 11 },
  van: { name: 'Cargo Bison Van', length: 5.2, width: 2.1, topSpeed: 27, accel: 10 },
  police: { name: 'SMPD Interceptor', length: 4.8, width: 1.95, topSpeed: 40, accel: 16 },
};

/** Pedestrian outfits: shirt, trousers and skin tones the figure builder mixes. */
export const PED_STYLES = [
  { shirt: 0xff6b5e, pants: 0x2b3a55, skin: 0xc98d64 },
  { shirt: 0x39c2d7, pants: 0xe8e4da, skin: 0x8a5a3b },
  { shirt: 0xf2e14c, pants: 0x35507a, skin: 0x6e4530 },
  { shirt: 0xff9ecb, pants: 0x22242a, skin: 0xe0ac88 },
  { shirt: 0x7dd87d, pants: 0x7a4a2b, skin: 0xa06a42 },
  { shirt: 0xe8e4da, pants: 0xd94f30, skin: 0x5d3a24 },
];

/** The player's own look, so the screenshots read her at a glance. */
export const PLAYER_STYLE = { shirt: 0x14b8a6, pants: 0xf2f0e6, skin: 0xa06a42, hair: 0x2a1a12 };

/**
 * The story chain, in order. Each mission is a list of steps; a step is done when the player
 * reaches its target (or does its verb), and the last step pays the reward. `time` is a whole
 * mission limit in seconds; `heat` on a step is the wanted level it raises when it starts.
 */
export const MISSIONS = [
  {
    title: 'Homecoming',
    intro: 'Luz Marino is back in Solmar City. Her coupe is parked where she left it, under the palms.',
    steps: [{ verb: 'enterCar', text: 'Get into your turquoise coupe' }],
    reward: 0,
  },
  {
    title: 'Beach Club Run',
    intro: 'Coco runs Club Azul and owes Luz a welcome-home drink — if Luz can cross the boulevard in time.',
    steps: [{ verb: 'reach', text: 'Drive to Club Azul on the boulevard', target: 'club' }],
    time: 80,
    reward: 300,
  },
  {
    title: 'A Package for Coco',
    intro: 'A crate came in at the West Docks. No manifest, no questions. Coco wants it at the Hotel Azahar.',
    steps: [
      { verb: 'reach', text: 'Pick up the package at the West Docks', target: 'docks' },
      { verb: 'reach', text: 'Deliver it to the Hotel Azahar', target: 'hotel', heat: 1 },
    ],
    reward: 500,
  },
  {
    title: 'Causeway Dash',
    intro: 'The lighthouse crew bet Luz cannot run the causeway checkpoints before the light turns.',
    steps: [
      { verb: 'reach', text: 'Checkpoint 1: the causeway gate', target: 'gate' },
      { verb: 'reach', text: 'Checkpoint 2: mid-causeway', target: 'midway' },
      { verb: 'reach', text: 'Checkpoint 3: the lighthouse', target: 'lighthouse' },
    ],
    time: 90,
    reward: 700,
  },
  {
    title: 'Five-Star Hideout',
    intro: 'The docks job was watched. Half the SMPD is rolling — shake them and reach the Lighthouse Garage.',
    steps: [{ verb: 'reach', text: 'Reach the Lighthouse Garage and lose the heat', target: 'hideout', heat: 3 }],
    reward: 1200,
  },
];

/** Extra reach targets the mission steps name, beyond PLACES. */
export const EXTRA_TARGETS = {
  gate: { x: 200, z: -318, name: 'the causeway gate' },
  midway: { x: 200, z: -480, name: 'mid-causeway' },
};

/** Story text the start and completion screens show. */
export const STORY = {
  tagline: 'One city. One coupe. Every cop in Solmar.',
  blurb:
    'Luz Marino left Solmar City with nothing. She came back for the one thing she ever owned outright: ' +
    'a turquoise coupe, a beach club tab, and a talent for being somewhere else when the sirens arrive.',
  complete: 'The city is yours again, Luz. The coupe is warm, the tab is paid, and Solmar glitters on.',
};
